package com.fyp.backend.service;

import com.fyp.backend.dto.ThreadDto;
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

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ThreadService {

    private final ThreadRepository threadRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final JwtUtil jwtUtil;

    /** Paginated, newest-first forum threads with a stable id tiebreaker. */
    public Map<String, Object> getThreads(int page, int size) {
        int safeSize = Pagination.clampSize(size);
        int safePage = Pagination.clampPage(page);
        Pageable pageable = PageRequest.of(safePage, safeSize,
                Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")));

        Page<Thread> result = threadRepository.findAll(pageable);
        List<ThreadDto> data = result.getContent().stream().map(this::mapToDto).collect(Collectors.toList());

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
                .title(dto.getTitle())
                .content(dto.getContent())
                .createdBy(user)
                .createdAt(LocalDateTime.now()) // 👈 add this
                .build();

        thread = threadRepository.save(thread);
        return mapToDto(thread);
    }

    public ThreadDto getThreadDtoById(Long id) {
        Thread thread = threadRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Thread not found"));
        return mapToDto(thread);
    }


    private ThreadDto mapToDto(Thread thread) {
        return ThreadDto.builder()
                .id(thread.getId())
                .title(thread.getTitle())
                .content(thread.getContent())
                .createdAt(thread.getCreatedAt())
                .createdById(thread.getCreatedBy().getId())
                .createdByName(thread.getCreatedBy().getFirstName() + " " + thread.getCreatedBy().getLastName())
                .reported(Boolean.TRUE.equals(thread.getReported()))
                .build();
    }

    public ThreadDto editThread(Long threadId, ThreadDto updatedDto, String token) {
        Thread thread = threadRepository.findById(threadId)
                .orElseThrow(() -> new RuntimeException("Thread not found"));

        User user = userService.getUserFromToken(token)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Authorization check: only creator can edit
        if (!thread.getCreatedBy().getId().equals(user.getId())) {
            throw new RuntimeException("Unauthorized");
        }

        // Update fields
        thread.setTitle(updatedDto.getTitle());
        thread.setContent(updatedDto.getContent());

        thread = threadRepository.save(thread);
        return mapToDto(thread);
    }

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

        threadRepository.delete(thread); // Optionally cascade delete replies via JPA
    }
}
