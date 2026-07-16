package com.fyp.backend.controller;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.model.MessageReport;
import com.fyp.backend.service.MessageReportService;
import com.fyp.backend.service.UserService;
import com.fyp.backend.util.Pagination;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Content reporting (chat messages, forum threads/replies, course reviews).
 * Any logged-in user can report a piece of content (once per item); the review
 * queue and resolve actions are admin-only and power the "Manage Reporting"
 * screen.
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
    public ResponseEntity<?> reportContent(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Long reporterId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        if (reporterId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Unauthorized");
        }
        // New clients send {contentType, contentId}; older ones send {messageId}.
        Long contentId = asLong(body.get("contentId"));
        String contentType = body.get("contentType") == null ? null : String.valueOf(body.get("contentType"));
        if (contentId == null) {
            contentId = asLong(body.get("messageId"));
            contentType = MessageReport.TYPE_MESSAGE;
        }
        if (contentId == null) {
            return ResponseEntity.badRequest().body("contentId (or messageId) is required");
        }
        try {
            return ResponseEntity.ok(messageReportService.createReport(contentType, contentId, reporterId));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    private Long asLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String s && !s.isBlank()) {
            try {
                return Long.valueOf(s.trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping
    public ResponseEntity<?> getReports(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        int safePage = Pagination.clampPage(page);
        int safeSize = Pagination.clampSize(size);

        try {
            Page<MessageReport> result = messageReportService.getReports(
                    status,
                    parseTimestampParam(from, false),
                    parseTimestampParam(to, true),
                    PageRequest.of(safePage, safeSize));

            Map<String, Object> pagination = new LinkedHashMap<>();
            pagination.put("page", safePage);
            pagination.put("size", safeSize);
            pagination.put("totalCount", result.getTotalElements());
            pagination.put("hasMore", result.hasNext());

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("success", true);
            body.put("data", result.getContent());
            body.put("pagination", pagination);
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
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

    private Timestamp parseTimestampParam(String value, boolean endOfDay) {
        if (value == null || value.isBlank()) {
            return null;
        }

        String trimmed = value.trim();
        try {
            return Timestamp.from(Instant.parse(trimmed));
        } catch (DateTimeParseException ignored) {
            // Try less specific formats below.
        }

        try {
            return Timestamp.from(OffsetDateTime.parse(trimmed).toInstant());
        } catch (DateTimeParseException ignored) {
            // Try local date-time below.
        }

        try {
            return Timestamp.valueOf(LocalDateTime.parse(trimmed.replace(" ", "T")));
        } catch (DateTimeParseException ignored) {
            // Try date-only below.
        }

        try {
            LocalDate date = LocalDate.parse(trimmed);
            return Timestamp.valueOf(endOfDay ? date.atTime(LocalTime.MAX) : date.atStartOfDay());
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Invalid date/time parameter: " + value);
        }
    }
}
