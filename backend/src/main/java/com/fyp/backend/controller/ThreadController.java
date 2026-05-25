package com.fyp.backend.controller;

import com.fyp.backend.dto.ThreadDto;
import com.fyp.backend.dto.ThreadReplyDto;
import com.fyp.backend.service.ThreadReplyService;
import com.fyp.backend.service.ThreadService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/threads")
@RequiredArgsConstructor
public class ThreadController {

    private final ThreadService threadService;
    private final ThreadReplyService replyService;

    // Get all threads
    @GetMapping
    public List<ThreadDto> getAllThreads() {
        return threadService.getAllThreads();
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
    public List<ThreadReplyDto> getReplies(@PathVariable Long id) {
        return replyService.getRepliesForThread(id);
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
