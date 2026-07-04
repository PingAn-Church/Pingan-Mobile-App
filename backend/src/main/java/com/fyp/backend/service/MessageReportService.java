package com.fyp.backend.service;

import java.sql.Timestamp;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageReport;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.MessageReportRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Message reporting: any user can flag another user's message once; admins
 * review the queue in "Manage Reporting" and resolve each report with a quick
 * action (deactivate the sender / delete the message / no problem).
 *
 * Throws IllegalArgumentException for bad input (missing message/report, own
 * message, unknown action) and IllegalStateException for conflicts (already
 * reported, already resolved) — the controller maps these to 400/409.
 */
@Service
public class MessageReportService {

    private final MessageReportRepository messageReportRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final ChatService chatService;

    public MessageReportService(MessageReportRepository messageReportRepository,
            MessageRepository messageRepository,
            UserRepository userRepository,
            UserService userService,
            ChatService chatService) {
        this.messageReportRepository = messageReportRepository;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.userService = userService;
        this.chatService = chatService;
    }

    @Transactional
    public MessageReport createReport(Long messageId, Long reporterId) {
        if (messageReportRepository.existsByMessageId(messageId)) {
            throw new IllegalStateException("This message has already been reported.");
        }

        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found."));

        User sender = message.getSender();
        if (sender != null && reporterId.equals(sender.getId())) {
            throw new IllegalArgumentException("You cannot report your own message.");
        }

        User reporter = userRepository.findById(reporterId)
                .orElseThrow(() -> new IllegalArgumentException("Reporter not found."));

        MessageReport report = new MessageReport();
        report.setMessageId(messageId);
        report.setConversationId(message.getConversation() != null ? message.getConversation().getId() : null);
        report.setConversationType(message.getConversationType());
        report.setMessageType(message.getType());
        report.setMessageContent(message.getContent());
        if (sender != null) {
            report.setSenderId(sender.getId());
            report.setSenderName(fullName(sender));
        }
        report.setReporterId(reporterId);
        report.setReporterName(fullName(reporter));
        report.setReportedAt(new Timestamp(System.currentTimeMillis()));
        report.setStatus(MessageReport.STATUS_PENDING);

        return messageReportRepository.save(report);
    }

    /** Paged report queue, optionally filtered by status and reportedAt range. */
    public Page<MessageReport> getReports(String status, Timestamp from, Timestamp to, Pageable pageable) {
        String normalizedStatus = normalizeStatus(status);
        if (from != null && to != null && from.after(to)) {
            throw new IllegalArgumentException("from must be before or equal to to.");
        }
        return messageReportRepository.findReports(normalizedStatus, from, to, pageable);
    }

    @Transactional
    public MessageReport resolveReport(Long reportId, String action, Long adminId) {
        MessageReport report = messageReportRepository.findById(reportId)
                .orElseThrow(() -> new IllegalArgumentException("Report not found."));

        if (!MessageReport.STATUS_PENDING.equals(report.getStatus())) {
            throw new IllegalStateException("This report has already been resolved.");
        }

        switch (action) {
            case MessageReport.ACTION_DEACTIVATE_USER -> {
                if (report.getSenderId() == null) {
                    throw new IllegalArgumentException("The sender of this message no longer exists.");
                }
                // Refuses to deactivate admins — surfaces as a 400 with its message.
                userService.updateUserActiveStatus(report.getSenderId(), false);
            }
            case MessageReport.ACTION_DELETE_MESSAGE -> {
                // The message may already be gone (sender deleted it); the report is
                // still resolvable — the offending content no longer exists either way.
                if (messageRepository.existsById(report.getMessageId())) {
                    chatService.deleteMessageAndBroadcast(report.getMessageId());
                }
            }
            case MessageReport.ACTION_NO_PROBLEM -> {
                // Nothing to do — reviewed and cleared.
            }
            default -> throw new IllegalArgumentException("Unknown resolve action: " + action);
        }

        User admin = userRepository.findById(adminId)
                .orElseThrow(() -> new IllegalArgumentException("Admin not found."));

        report.setStatus(MessageReport.STATUS_RESOLVED);
        report.setResolution(action);
        report.setResolvedById(adminId);
        report.setResolvedByName(fullName(admin));
        report.setResolvedAt(new Timestamp(System.currentTimeMillis()));
        return messageReportRepository.save(report);
    }

    private String fullName(User user) {
        String first = user.getFirstName() != null ? user.getFirstName() : "";
        String last = user.getLastName() != null ? user.getLastName() : "";
        String name = (first + " " + last).trim();
        return name.isEmpty() ? user.getEmail() : name;
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }

        String normalized = status.trim().toUpperCase();
        if (MessageReport.STATUS_PENDING.equals(normalized) || MessageReport.STATUS_RESOLVED.equals(normalized)) {
            return normalized;
        }
        throw new IllegalArgumentException("status must be PENDING or RESOLVED.");
    }
}
