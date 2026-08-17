package com.fyp.backend.service;

import com.fyp.backend.dto.ThreadDto;
import com.fyp.backend.exception.ContentUnderReviewException;
import com.fyp.backend.dto.ModerationEvent;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;
import com.fyp.backend.util.Pagination;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ThreadService {

    private final ThreadRepository threadRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final JwtUtil jwtUtil;
    private final ModerationEventPublisher moderationEventPublisher;
    private final ContentSanitizer contentSanitizer;
    private final TopicSubscriptionService topicSubscriptionService;
    private final ThreadContentCleanupService threadContentCleanupService;

    /** Paginated, newest-first forum threads with a stable id tiebreaker. */
    public Map<String, Object> getThreads(int page, int size, String token) {
        User requester = requireUser(token);
        int safeSize = Pagination.clampSize(size);
        int safePage = Pagination.clampPage(page);
        Pageable pageable = PageRequest.of(safePage, safeSize,
                Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")));

        Page<Thread> result = threadRepository.findAll(pageable);
        // One lookup for the whole page: asking per row would be a query per topic
        // just to decide whether its bell is filled in.
        Set<Long> subscribed = new HashSet<>(topicSubscriptionService.subscribedThreadIds(requester.getId()));
        List<ThreadDto> data = result.getContent().stream()
                .map(thread -> mapToDto(thread, requester, subscribed.contains(thread.getId())))
                .collect(Collectors.toList());

        Map<String, Object> pagination = new LinkedHashMap<>();
        pagination.put("page", safePage);
        pagination.put("size", safeSize);
        pagination.put("totalCount", result.getTotalElements());
        pagination.put("hasMore", result.hasNext());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("data", data);
        response.put("pagination", pagination);
        return response;
    }

    public ThreadDto createThread(ThreadDto dto, String token) {
        User user = userService.getUserFromToken(token)
                .orElseThrow(() -> new RuntimeException("User not found"));

        Thread thread = Thread.builder()
                .title(contentSanitizer.mask(dto.getTitle()))
                .content(contentSanitizer.mask(dto.getContent()))
                .coverImage(normaliseNewCoverImage(dto.getCoverImage(), user.getId()))
                .createdBy(user)
                .createdAt(LocalDateTime.now()) // 👈 add this
                .build();

        thread = threadRepository.save(thread);
        // Posting a topic means you are waiting for the answers, so you follow it.
        topicSubscriptionService.subscribeAuthor(thread.getId(), user.getId());
        return mapToDto(thread, user, true);
    }

    public ThreadDto getThreadDtoById(Long id, String token) {
        User requester = requireUser(token);
        Thread thread = threadRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Thread not found"));
        return mapToDto(thread, requester, topicSubscriptionService.isSubscribed(id, requester.getId()));
    }


    private ThreadDto mapToDto(Thread thread, User requester, boolean subscribed) {
        boolean canView = !Boolean.TRUE.equals(thread.getReported())
                || thread.getCreatedBy().getId().equals(requester.getId())
                || requester.isAdmin();
        return ThreadDto.builder()
                .id(thread.getId())
                .title(canView ? thread.getTitle() : null)
                .content(canView ? thread.getContent() : null)
                // A reported thread hides its picture along with its words.
                .coverImage(canView ? thread.getCoverImage() : null)
                .createdAt(thread.getCreatedAt())
                .createdById(thread.getCreatedBy().getId())
                .createdByName(thread.getCreatedBy().getFirstName() + " " + thread.getCreatedBy().getLastName())
                .createdByFirstName(thread.getCreatedBy().getFirstName())
                .createdByLastName(thread.getCreatedBy().getLastName())
                .reported(Boolean.TRUE.equals(thread.getReported()))
                .subscribed(subscribed)
                .build();
    }

    @Transactional
    public ThreadDto editThread(Long threadId, ThreadDto updatedDto, String token) {
        Thread thread = threadRepository.findById(threadId)
                .orElseThrow(() -> new RuntimeException("Thread not found"));

        User user = userService.getUserFromToken(token)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Authorization check: only creator can edit
        if (!thread.getCreatedBy().getId().equals(user.getId())) {
            throw new RuntimeException("Unauthorized");
        }
        if (Boolean.TRUE.equals(thread.getReported())) {
            throw new ContentUnderReviewException();
        }

        // Update fields
        thread.setTitle(contentSanitizer.mask(updatedDto.getTitle()));
        thread.setContent(contentSanitizer.mask(updatedDto.getContent()));
        String previousCover = thread.getCoverImage();
        applyCoverImage(thread, updatedDto.getCoverImage(), user.getId());

        thread = threadRepository.save(thread);
        threadContentCleanupService.cleanupReplacedReference(previousCover, thread.getCoverImage());
        return mapToDto(thread, user, topicSubscriptionService.isSubscribed(threadId, user.getId()));
    }

    /**
     * Keeps only object paths this app owns. A cover picture arrives as whatever
     * the client says it uploaded, and storing an arbitrary external URL would
     * turn every thread into a way to load a third party's image on every reader's
     * device. Blank means "no picture", which is the normal case.
     */
    private String normaliseNewCoverImage(String coverImage, Long ownerId) {
        if (coverImage == null || coverImage.isBlank()) return null;
        return threadContentCleanupService.requireOwnedImageReference(coverImage, ownerId);
    }

    /**
     * Applies a cover-picture edit, telling "leave it alone" apart from "remove it".
     *
     * An absent field means the client is not talking about the picture — which is
     * every app build released before cover pictures existed, since those send only
     * a title and a body. Treating that as "remove" made editing a thread from an
     * older phone silently wipe a cover somebody had set from a newer one.
     * Removing is therefore an explicit empty string, which is what the edit screen
     * sends once the picture is cleared.
     *
     * A non-empty new value must be one of the current author's uploads. Invalid
     * references fail the edit; they are never interpreted as a request to delete.
     */
    private void applyCoverImage(Thread thread, String requested, Long ownerId) {
        if (requested == null) return;

        String trimmed = requested.trim();
        if (trimmed.isEmpty()) {
            thread.setCoverImage(null);
            return;
        }
        // The same stored value may be a legacy, pre-owner-prefix object. It is
        // safe to retain; only a newly introduced reference must prove ownership.
        if (trimmed.equals(thread.getCoverImage())) {
            return;
        }
        thread.setCoverImage(threadContentCleanupService.requireOwnedImageReference(trimmed, ownerId));
    }

    @Transactional
    public void deleteThread(Long threadId, String token) {
        String rawToken = token.replace("Bearer ", "");
        String email = jwtUtil.extractEmail(rawToken);
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        Thread thread = threadRepository.findById(threadId)
                .orElseThrow(() -> new RuntimeException("Thread not found"));

        // Author or admin (content moderation) may delete.
        if (!thread.getCreatedBy().getId().equals(user.getId()) && !user.isAdmin()) {
            throw new RuntimeException("Unauthorized to delete this thread.");
        }

        moderationEventPublisher.publishAfterCommit(ModerationEvent.builder()
                .contentType(com.fyp.backend.model.MessageReport.TYPE_THREAD)
                .contentId(threadId)
                .threadId(threadId)
                .state(ModerationEvent.STATE_DELETED)
                .build());
        threadContentCleanupService.deleteThread(thread);
    }

    private User requireUser(String token) {
        return userService.getUserFromToken(token)
                .orElseThrow(() -> new RuntimeException("User not found"));
    }
}
