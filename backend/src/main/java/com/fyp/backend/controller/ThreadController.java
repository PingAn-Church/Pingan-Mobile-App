package com.fyp.backend.controller;

import com.fyp.backend.dto.ThreadDto;
import com.fyp.backend.dto.ThreadReplyDto;
import com.fyp.backend.service.ThreadReplyService;
import com.fyp.backend.service.ThreadService;
import com.fyp.backend.service.TopicSubscriptionService;
import com.fyp.backend.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/threads")
@RequiredArgsConstructor
@PreAuthorize("hasRole('VERIFIED')")
public class ThreadController {

    private final ThreadService threadService;
    private final ThreadReplyService replyService;
    private final TopicSubscriptionService topicSubscriptionService;
    private final UserService userService;

    /**
     * Follows or unfollows a topic. Topics are silent by default, so this is what
     * opts somebody into hearing about replies.
     */
    @PutMapping("/{id}/subscription")
    public ResponseEntity<Map<String, Object>> setSubscription(
            @PathVariable Long id,
            @RequestBody Map<String, Boolean> body,
            @RequestHeader("Authorization") String token) {
        Long userId = requireUserId(token);
        boolean wanted = body != null && Boolean.TRUE.equals(body.get("subscribed"));
        try {
            boolean subscribed = topicSubscriptionService.setSubscribed(id, userId, wanted);
            return ResponseEntity.ok(Map.of("success", true, "subscribed", subscribed));
        } catch (TopicSubscriptionService.TopicNotFoundException gone) {
            // The topic was deleted while this client still had it on screen.
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("success", false, "subscribed", false));
        }
    }

    /**
     * Marks a topic read, called when it is opened. Only affects the caller's own
     * subscription; opening a topic you don't follow does nothing.
     */
    @PostMapping("/{id}/seen")
    public Map<String, Object> markSeen(
            @PathVariable Long id,
            @RequestHeader("Authorization") String token) {
        topicSubscriptionService.markSeen(id, requireUserId(token));
        return Map.of("success", true);
    }

    /** Unseen replies across every topic the caller follows — the Topics row badge. */
    @GetMapping("/subscriptions/unread-count")
    public Map<String, Object> unreadSubscriptionCount(@RequestHeader("Authorization") String token) {
        return Map.of("success", true,
                "count", topicSubscriptionService.unseenReplyCount(requireUserId(token)));
    }

    private Long requireUserId(String token) {
        Long userId = userService.getUserIdFromToken(token);
        if (userId == null) {
            throw new IllegalArgumentException("Unauthorized");
        }
        return userId;
    }

    // Paginated, newest-first threads: { success, data, pagination }.
    @GetMapping
    public Map<String, Object> getThreads(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestHeader("Authorization") String token) {
        return threadService.getThreads(page, size, token);
    }

    // Get a single thread by ID
    @GetMapping("/{id}")
    public ThreadDto getThreadById(
            @PathVariable Long id,
            @RequestHeader("Authorization") String token) {
        return threadService.getThreadDtoById(id, token);
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


    /**
     * Current clients explicitly request newest-first pages. Requests without an
     * order retain the original oldest-first contract for older app builds.
     */
    @GetMapping("/{id}/replies")
    public Map<String, Object> getReplies(
            @PathVariable Long id,
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) Long after,
            @RequestParam(required = false) String order,
            @RequestParam(defaultValue = "20") int size,
            @RequestHeader("Authorization") String token) {
        return replyService.getRepliesPage(id, before, after, size, order, token);
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

    @GetMapping("/replies/{replyId}")
    public ThreadReplyDto getReply(
            @PathVariable Long replyId,
            @RequestHeader("Authorization") String token) {
        return replyService.getReplyById(replyId, token);
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
