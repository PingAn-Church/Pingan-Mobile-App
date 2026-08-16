package com.fyp.backend.service;

import com.fyp.backend.dto.ThreadReplyDto;
import com.fyp.backend.exception.ContentUnderReviewException;
import com.fyp.backend.dto.ModerationEvent;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import com.fyp.backend.util.Pagination;

@Service
@RequiredArgsConstructor
public class ThreadReplyService {

    private final ThreadReplyRepository replyRepository;
    private final ThreadRepository threadRepository;
    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;
    private final ModerationEventPublisher moderationEventPublisher;
    private final ContentSanitizer contentSanitizer;
    private final TopicSubscriptionService topicSubscriptionService;
    private final PushNotificationService pushNotificationService;
    private final PushMessages pushMessages;

    public Map<String, Object> getRepliesPage(Long threadId, Long after, int size, String token) {
        User requester = requireUser(token);
        int safeSize = Pagination.clampSize(size);
        List<ThreadReply> fetched = after == null
                ? replyRepository.findByThreadIdOrderByIdAsc(threadId, PageRequest.of(0, safeSize + 1))
                : replyRepository.findByThreadIdAndIdGreaterThanOrderByIdAsc(threadId, after, PageRequest.of(0, safeSize + 1));
        boolean hasMore = fetched.size() > safeSize;
        List<ThreadReply> page = hasMore ? fetched.subList(0, safeSize) : fetched;
        List<ThreadReplyDto> data = page.stream()
                .map(reply -> mapToDto(reply, requester))
                .collect(Collectors.toList());

        Map<String, Object> pagination = new LinkedHashMap<>();
        pagination.put("nextCursor", page.isEmpty() ? after : page.get(page.size() - 1).getId());
        pagination.put("hasMore", hasMore);
        pagination.put("size", safeSize);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("data", data);
        body.put("pagination", pagination);
        return body;
    }

    public ThreadReplyDto getReplyById(Long replyId, String token) {
        User requester = requireUser(token);
        ThreadReply reply = replyRepository.findById(replyId)
                .orElseThrow(() -> new RuntimeException("Reply not found"));
        return mapToDto(reply, requester);
    }

    public ThreadReplyDto addReply(ThreadReplyDto dto, String token) {
        Thread thread = threadRepository.findById(dto.getThreadId())
                .orElseThrow(() -> new RuntimeException("Thread not found"));

        String rawToken = token.replace("Bearer ", "");
        String email = jwtUtil.extractEmail(rawToken);
        User author = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        ThreadReply reply = ThreadReply.builder()
                .content(contentSanitizer.mask(dto.getContent()))
                // Only object paths this app owns; an arbitrary external URL here
                // would load a third party's image on every reader's device.
                .imageUrl(OSSService.isManagedKeyOrUrl(dto.getImageUrl()) ? dto.getImageUrl().trim() : null)
                .author(author)
                .thread(thread)
                .createdAt(LocalDateTime.now())
                .build();

        reply = replyRepository.save(reply);
        notifySubscribers(thread, reply, author);
        return mapToDto(reply, author);
    }

    /**
     * Tells everyone following this topic that there is a new answer.
     *
     * Only followers — the whole point of the bell is that a forum post does not
     * notify the entire church. Best-effort: a reply must never fail because a
     * push did.
     */
    private void notifySubscribers(Thread thread, ThreadReply reply, User author) {
        try {
            List<Long> subscribers =
                    topicSubscriptionService.subscriberIdsExcept(thread.getId(), author.getId());
            if (subscribers.isEmpty()) return;

            LocalizedText authorName = pushMessages.personName(author.getFirstName(), author.getLastName());
            String snippet = reply.getContent() == null ? "" : reply.getContent().trim();
            LocalizedText body = language -> {
                String shown = snippet.isEmpty()
                        ? pushMessages.get(language, "push.chat.photo")
                        : snippet;
                return pushMessages.get(language, "push.thread.newReply.body",
                        authorName.render(language), shown);
            };

            pushNotificationService.sendPushNotification(
                    subscribers,
                    body,
                    pushMessages.literal(thread.getTitle()),
                    thread.getId(),
                    "thread");
        } catch (Exception ignored) {
            // best-effort notification; never disrupt the reply that triggered it
        }
    }

    private ThreadReplyDto mapToDto(ThreadReply reply, User requester) {
        boolean canView = !Boolean.TRUE.equals(reply.getReported())
                || reply.getAuthor().getId().equals(requester.getId())
                || requester.isAdmin();
        return ThreadReplyDto.builder()
                .id(reply.getId())
                .content(canView ? reply.getContent() : null)
                // A reported reply hides its picture along with its words.
                .imageUrl(canView ? reply.getImageUrl() : null)
                .createdAt(reply.getCreatedAt())
                .threadId(reply.getThread().getId())
                .authorId(reply.getAuthor().getId())
                .authorName(reply.getAuthor().getFirstName() + " " + reply.getAuthor().getLastName())
                .authorFirstName(reply.getAuthor().getFirstName())
                .authorLastName(reply.getAuthor().getLastName())
                .reported(Boolean.TRUE.equals(reply.getReported()))
                .build();
    }

    public ThreadReplyDto editReply(Long replyId, ThreadReplyDto updatedDto, String token) {
        ThreadReply reply = replyRepository.findById(replyId)
                .orElseThrow(() -> new RuntimeException("Reply not found"));

        String email = jwtUtil.extractEmail(token.replace("Bearer ", ""));
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (!reply.getAuthor().getId().equals(user.getId())) {
            throw new RuntimeException("Unauthorized");
        }
        if (Boolean.TRUE.equals(reply.getReported())) {
            throw new ContentUnderReviewException();
        }

        reply.setContent(contentSanitizer.mask(updatedDto.getContent()));
        reply = replyRepository.save(reply);

        return mapToDto(reply, user);
    }

    @Transactional
    public void deleteReply(Long replyId, String token) {
        String rawToken = token.replace("Bearer ", "");
        String email = jwtUtil.extractEmail(rawToken);
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        ThreadReply reply = replyRepository.findById(replyId)
                .orElseThrow(() -> new RuntimeException("Reply not found"));

        // Author or admin (content moderation) may delete.
        if (!reply.getAuthor().getId().equals(user.getId()) && !user.isAdmin()) {
            throw new RuntimeException("Unauthorized to delete this reply.");
        }

        Long threadId = reply.getThread() != null ? reply.getThread().getId() : null;
        replyRepository.delete(reply);
        moderationEventPublisher.publishAfterCommit(ModerationEvent.builder()
                .contentType(com.fyp.backend.model.MessageReport.TYPE_THREAD_REPLY)
                .contentId(replyId)
                .threadId(threadId)
                .state(ModerationEvent.STATE_DELETED)
                .build());
    }

    private User requireUser(String token) {
        String email = jwtUtil.extractEmail(token.replace("Bearer ", ""));
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
    }
}
