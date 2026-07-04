package com.fyp.backend.controller;

import com.fyp.backend.dto.ThreadDto;
import com.fyp.backend.dto.ThreadReplyDto;
import com.fyp.backend.service.ThreadReplyService;
import com.fyp.backend.service.ThreadService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/threads")
@RequiredArgsConstructor
public class ThreadController {

    private final ThreadService threadService;
    private final ThreadReplyService replyService;

    // Paginated, newest-first threads: { success, data, pagination }.
    @GetMapping
    public Map<String, Object> getThreads(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return threadService.getThreads(page, size);
    }

    // Get a single thread by ID
    @GetMapping("/{id}")
    public ThreadDto getThreadById(@PathVariable Long id) {
        return threadService.getThreadDtoById(id);
    }

    // Create new thread
    @PostMapping
    public ThreadDto createThread(
            @RequestBody ThreadDto dto,
            @RequestHeader("Authorization") String token
    ) {
        return threadService.createThread(dto, token);
    }

    // Edit a thread
    @PutMapping("/{id}")
    public ThreadDto editThread(
            @PathVariable Long id,
            @RequestBody ThreadDto dto,
            @RequestHeader("Authorization") String token
    ) {
        return threadService.editThread(id, dto, token);
    }


    // Get replies for a thread
    @GetMapping("/{id}/replies")
    public Map<String, Object> getReplies(
            @PathVariable Long id,
            @RequestParam(required = false) Long after,
            @RequestParam(defaultValue = "20") int size) {
        return replyService.getRepliesPage(id, after, size);
    }

    // Add reply to a thread
    @PostMapping("/{id}/replies")
    public ThreadReplyDto addReply(
            @PathVariable Long id,
            @RequestBody ThreadReplyDto dto,
            @RequestHeader("Authorization") String token
    ) {
        dto.setThreadId(id);
        return replyService.addReply(dto, token);
    }

    @PutMapping("/replies/{replyId}")
    public ThreadReplyDto editReply(
            @PathVariable Long replyId,
            @RequestBody ThreadReplyDto dto,
            @RequestHeader("Authorization") String token
    ) {
        return replyService.editReply(replyId, dto, token);
    }

    @DeleteMapping("/replies/{replyId}")
    public void deleteReply(
            @PathVariable Long replyId,
            @RequestHeader("Authorization") String token
    ) {
        replyService.deleteReply(replyId, token);
    }

    @DeleteMapping("/{threadId}")
    public void deleteThread(
            @PathVariable Long threadId,
            @RequestHeader("Authorization") String token
    ) {
        threadService.deleteThread(threadId, token);
    }

}
