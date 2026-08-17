package com.fyp.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.service.UserBlockService;
import com.fyp.backend.service.UserService;

import jakarta.servlet.http.HttpServletRequest;

/** User blocking. All endpoints act on behalf of the authenticated user. */
@RestController
@RequestMapping("/api/blocks")
@PreAuthorize("hasRole('VERIFIED')")
public class BlockController {

    private final UserBlockService userBlockService;
    private final UserService userService;

    public BlockController(UserBlockService userBlockService, UserService userService) {
        this.userBlockService = userBlockService;
        this.userService = userService;
    }

    private Long requireUserId(HttpServletRequest request) {
        return userService.getUserIdFromToken(request.getHeader("Authorization"));
    }

    /** IDs of every user I've blocked (used to flag group chats and pickers). */
    @GetMapping
    public ResponseEntity<?> myBlocks(HttpServletRequest request) {
        Long me = requireUserId(request);
        if (me == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Unauthorized");
        return ResponseEntity.ok(userBlockService.getBlockedIds(me));
    }

    /** Block relationship between me and another user (both directions). */
    @GetMapping("/status")
    public ResponseEntity<?> status(@RequestParam Long userId, HttpServletRequest request) {
        Long me = requireUserId(request);
        if (me == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Unauthorized");
        return ResponseEntity.ok(userBlockService.getStatus(me, userId));
    }

    @PostMapping
    public ResponseEntity<?> block(@RequestBody Map<String, Long> body, HttpServletRequest request) {
        Long me = requireUserId(request);
        if (me == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Unauthorized");
        Long blockedUserId = body.get("userId");
        if (blockedUserId == null) return ResponseEntity.badRequest().body("userId is required");
        try {
            userBlockService.block(me, blockedUserId);
            return ResponseEntity.ok(userBlockService.getStatus(me, blockedUserId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<?> unblock(@PathVariable Long userId, HttpServletRequest request) {
        Long me = requireUserId(request);
        if (me == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Unauthorized");
        userBlockService.unblock(me, userId);
        return ResponseEntity.ok(userBlockService.getStatus(me, userId));
    }
}
