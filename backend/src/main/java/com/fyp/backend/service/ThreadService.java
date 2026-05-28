package com.fyp.backend.service;

import com.fyp.backend.dto.ThreadDto;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ThreadService {

    private final ThreadRepository threadRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final JwtUtil jwtUtil;

    public List<ThreadDto> getAllThreads() {
        return threadRepository.findAll()
                .stream()
                .map(this::mapToDto)
                .collect(Collectors.toList());
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

        if (!thread.getCreatedBy().getId().equals(user.getId())) {
            throw new RuntimeException("Unauthorized to delete this thread.");
        }

        threadRepository.delete(thread); // Optionally cascade delete replies via JPA
    }
}
