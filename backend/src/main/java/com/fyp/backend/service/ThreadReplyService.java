package com.fyp.backend.service;

import com.fyp.backend.dto.ThreadReplyDto;
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

    public List<ThreadReplyDto> getRepliesForThread(Long threadId) {
        return replyRepository.findByThreadId(threadId)
                .stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
    }

    public Map<String, Object> getRepliesPage(Long threadId, Long after, int size) {
        int safeSize = Pagination.clampSize(size);
        List<ThreadReply> fetched = after == null
                ? replyRepository.findByThreadIdOrderByIdAsc(threadId, PageRequest.of(0, safeSize + 1))
                : replyRepository.findByThreadIdAndIdGreaterThanOrderByIdAsc(threadId, after, PageRequest.of(0, safeSize + 1));
        boolean hasMore = fetched.size() > safeSize;
        List<ThreadReply> page = hasMore ? fetched.subList(0, safeSize) : fetched;
        List<ThreadReplyDto> data = page.stream().map(this::mapToDto).collect(Collectors.toList());

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

    public ThreadReplyDto addReply(ThreadReplyDto dto, String token) {
        Thread thread = threadRepository.findById(dto.getThreadId())
                .orElseThrow(() -> new RuntimeException("Thread not found"));

        String rawToken = token.replace("Bearer ", "");
        String email = jwtUtil.extractEmail(rawToken);
        User author = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        ThreadReply reply = ThreadReply.builder()
                .content(dto.getContent())
                .author(author)
                .thread(thread)
                .createdAt(LocalDateTime.now())
                .build();

        reply = replyRepository.save(reply);
        return mapToDto(reply);
    }

    private ThreadReplyDto mapToDto(ThreadReply reply) {
        return ThreadReplyDto.builder()
                .id(reply.getId())
                .content(reply.getContent())
                .createdAt(reply.getCreatedAt())
                .threadId(reply.getThread().getId())
                .authorId(reply.getAuthor().getId())
                .authorName(reply.getAuthor().getFirstName() + " " + reply.getAuthor().getLastName())
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

        reply.setContent(updatedDto.getContent());
        reply = replyRepository.save(reply);

        return mapToDto(reply);
    }

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

        replyRepository.delete(reply);
    }
}
