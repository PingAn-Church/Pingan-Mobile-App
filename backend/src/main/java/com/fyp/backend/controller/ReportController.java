package com.fyp.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.model.MessageReport;
import com.fyp.backend.service.MessageReportService;
import com.fyp.backend.service.UserService;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Chat-message reporting. Any logged-in user can report a message (once per
 * message); the review queue and resolve actions are admin-only and power the
 * "Manage Reporting" screen.
 */
@RestController
@RequestMapping("/api/reports")
public class ReportController {

    private final MessageReportService messageReportService;
    private final UserService userService;

    public ReportController(MessageReportService messageReportService, UserService userService) {
        this.messageReportService = messageReportService;
        this.userService = userService;
    }

    @PostMapping
    public ResponseEntity<?> reportMessage(@RequestBody Map<String, Long> body, HttpServletRequest request) {
        Long reporterId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (reporterId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Unauthorized");
        }
        Long messageId = body.get("messageId");
        if (messageId == null) {
            return ResponseEntity.badRequest().body("messageId is required");
        }
        try {
            return ResponseEntity.ok(messageReportService.createReport(messageId, reporterId));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping
    public ResponseEntity<List<MessageReport>> getReports() {
        return ResponseEntity.ok(messageReportService.getAllReports());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/{id}/resolve")
    public ResponseEntity<?> resolveReport(@PathVariable Long id,
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        Long adminId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (adminId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Unauthorized");
        }
        String action = body.get("action");
        if (action == null || action.isBlank()) {
            return ResponseEntity.badRequest().body("action is required");
        }
        try {
            return ResponseEntity.ok(messageReportService.resolveReport(id, action, adminId));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (RuntimeException e) {
            // e.g. "Downgrade this admin before deactivating the account."
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
