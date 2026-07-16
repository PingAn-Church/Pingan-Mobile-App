package com.fyp.backend.service;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.CourseRating;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageReport;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.MessageReportRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserRepository;

import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;

/**
 * Content reporting: any user can flag another user's content once — a chat
 * message, forum thread, thread reply, or course review. Reporting shadow-hides
 * the content ("Reported, pending review" for everyone except its author) until
 * an admin reviews the queue in "Manage Reporting" and resolves each report
 * with a quick action (deactivate the author / delete the content / no problem,
 * which restores visibility).
 *
 * Throws IllegalArgumentException for bad input (missing content/report, own
 * content, unknown action/type) and IllegalStateException for conflicts
 * (already reported, already resolved) — the controller maps these to 400/409.
 */
@Service
public class MessageReportService {

    private final MessageReportRepository messageReportRepository;
    private final MessageRepository messageRepository;
    private final ThreadRepository threadRepository;
    private final ThreadReplyRepository threadReplyRepository;
    private final CourseRatingRepository courseRatingRepository;
    private final UserRepository userRepository;
    private final UserService userService;
    private final ChatService chatService;
    private final ReviewService reviewService;

    public MessageReportService(MessageReportRepository messageReportRepository,
            MessageRepository messageRepository,
            ThreadRepository threadRepository,
            ThreadReplyRepository threadReplyRepository,
            CourseRatingRepository courseRatingRepository,
            UserRepository userRepository,
            UserService userService,
            ChatService chatService,
            ReviewService reviewService) {
        this.messageReportRepository = messageReportRepository;
        this.messageRepository = messageRepository;
        this.threadRepository = threadRepository;
        this.threadReplyRepository = threadReplyRepository;
        this.courseRatingRepository = courseRatingRepository;
        this.userRepository = userRepository;
        this.userService = userService;
        this.chatService = chatService;
        this.reviewService = reviewService;
    }

    /** Legacy entry point: report a chat message. */
    @Transactional
    public MessageReport createReport(Long messageId, Long reporterId) {
        return createReport(MessageReport.TYPE_MESSAGE, messageId, reporterId);
    }

    @Transactional
    public MessageReport createReport(String contentType, Long contentId, Long reporterId) {
        String type = normalizeContentType(contentType);

        if (messageReportRepository.existsByContentTypeAndContentId(type, contentId)
                || (MessageReport.TYPE_MESSAGE.equals(type)
                        && messageReportRepository.existsByContentTypeIsNullAndContentId(contentId))) {
            throw new IllegalStateException("This content has already been reported.");
        }

        MessageReport report = new MessageReport();
        report.setContentType(type);
        report.setContentId(contentId);
        report.setMessageType("text");

        // Snapshot the content + author, reject self-reports, and shadow-hide the
        // content (its author keeps seeing the original) until an admin resolves.
        switch (type) {
            case MessageReport.TYPE_MESSAGE -> {
                Message message = messageRepository.findById(contentId)
                        .orElseThrow(() -> new IllegalArgumentException("Message not found."));
                applyAuthor(report, message.getSender(), reporterId, "message");
                report.setConversationId(message.getConversation() != null ? message.getConversation().getId() : null);
                report.setConversationType(message.getConversationType());
                report.setMessageType(message.getType());
                report.setMessageContent(message.getContent());
                message.setReported(true);
                messageRepository.save(message);
            }
            case MessageReport.TYPE_THREAD -> {
                Thread thread = threadRepository.findById(contentId)
                        .orElseThrow(() -> new IllegalArgumentException("Thread not found."));
                applyAuthor(report, thread.getCreatedBy(), reporterId, "thread");
                report.setMessageContent(joinTitleAndBody(thread.getTitle(), thread.getContent()));
                thread.setReported(true);
                threadRepository.save(thread);
            }
            case MessageReport.TYPE_THREAD_REPLY -> {
                ThreadReply reply = threadReplyRepository.findById(contentId)
                        .orElseThrow(() -> new IllegalArgumentException("Reply not found."));
                applyAuthor(report, reply.getAuthor(), reporterId, "reply");
                report.setMessageContent(reply.getContent());
                reply.setReported(true);
                threadReplyRepository.save(reply);
            }
            case MessageReport.TYPE_COURSE_REVIEW -> {
                CourseRating rating = courseRatingRepository.findById(contentId)
                        .orElseThrow(() -> new IllegalArgumentException("Review not found."));
                User author = rating.getUserId() == null ? null
                        : userRepository.findById(rating.getUserId()).orElse(null);
                applyAuthor(report, author, reporterId, "review");
                report.setMessageContent(rating.getRating() + "/5 - " + (rating.getReview() == null ? "" : rating.getReview()));
                rating.setReviewStatus("flagged");
                courseRatingRepository.save(rating);
                // Flagged reviews drop out of the visible rating summary.
                reviewService.recomputeCourseRating(rating.getCourseId());
            }
            default -> throw new IllegalArgumentException("Unknown content type: " + contentType);
        }

        User reporter = userRepository.findById(reporterId)
                .orElseThrow(() -> new IllegalArgumentException("Reporter not found."));
        report.setReporterId(reporterId);
        report.setReporterName(fullName(reporter));
        report.setReportedAt(new Timestamp(System.currentTimeMillis()));
        report.setStatus(MessageReport.STATUS_PENDING);

        return messageReportRepository.save(report);
    }

    private void applyAuthor(MessageReport report, User author, Long reporterId, String noun) {
        if (author != null && reporterId.equals(author.getId())) {
            throw new IllegalArgumentException("You cannot report your own " + noun + ".");
        }
        if (author != null) {
            report.setSenderId(author.getId());
            report.setSenderName(fullName(author));
        }
    }

    private String joinTitleAndBody(String title, String body) {
        String safeTitle = title == null ? "" : title.trim();
        String safeBody = body == null ? "" : body.trim();
        if (safeTitle.isEmpty()) return safeBody;
        if (safeBody.isEmpty()) return safeTitle;
        return safeTitle + "\n\n" + safeBody;
    }

    /** Paged report queue, optionally filtered by status and reportedAt range. */
    public Page<MessageReport> getReports(String status, Timestamp from, Timestamp to, Pageable pageable) {
        String normalizedStatus = normalizeStatus(status);
        if (from != null && to != null && from.after(to)) {
            throw new IllegalArgumentException("from must be before or equal to to.");
        }
        return messageReportRepository.findAll(reportFilter(normalizedStatus, from, to), pageable);
    }

    private Specification<MessageReport> reportFilter(String status, Timestamp from, Timestamp to) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("reportedAt"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("reportedAt"), to));
            }

            if (query != null && !Long.class.equals(query.getResultType()) && !long.class.equals(query.getResultType())) {
                Expression<Integer> statusRank = cb.<Integer>selectCase()
                        .when(cb.equal(root.get("status"), MessageReport.STATUS_PENDING), 0)
                        .otherwise(1);
                query.orderBy(cb.asc(statusRank), cb.desc(root.get("reportedAt")), cb.desc(root.get("id")));
            }

            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };
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
                    throw new IllegalArgumentException("The author of this content no longer exists.");
                }
                // Refuses to deactivate admins — surfaces as a 400 with its message.
                userService.updateUserActiveStatus(report.getSenderId(), false);
            }
            case MessageReport.ACTION_DELETE_MESSAGE -> deleteReportedContent(report);
            case MessageReport.ACTION_NO_PROBLEM -> restoreReportedContent(report);
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

    /**
     * Deletes the reported content. It may already be gone (author deleted it);
     * the report is still resolvable — the offending content no longer exists
     * either way.
     */
    private void deleteReportedContent(MessageReport report) {
        Long contentId = report.getContentId();
        switch (contentTypeOf(report)) {
            case MessageReport.TYPE_MESSAGE -> {
                if (messageRepository.existsById(contentId)) {
                    chatService.deleteMessageAndBroadcast(contentId);
                }
            }
            case MessageReport.TYPE_THREAD -> {
                if (threadRepository.existsById(contentId)) {
                    threadRepository.deleteById(contentId); // cascades to replies
                }
            }
            case MessageReport.TYPE_THREAD_REPLY -> {
                if (threadReplyRepository.existsById(contentId)) {
                    threadReplyRepository.deleteById(contentId);
                }
            }
            case MessageReport.TYPE_COURSE_REVIEW -> courseRatingRepository.findById(contentId)
                    .ifPresent(rating -> {
                        courseRatingRepository.delete(rating);
                        reviewService.recomputeCourseRating(rating.getCourseId());
                    });
            default -> throw new IllegalArgumentException("Unknown content type: " + report.getContentType());
        }
    }

    /** "No problem": lift the pending-review shadow so the content shows again. */
    private void restoreReportedContent(MessageReport report) {
        Long contentId = report.getContentId();
        switch (contentTypeOf(report)) {
            case MessageReport.TYPE_MESSAGE -> messageRepository.findById(contentId).ifPresent(message -> {
                message.setReported(false);
                messageRepository.save(message);
            });
            case MessageReport.TYPE_THREAD -> threadRepository.findById(contentId).ifPresent(thread -> {
                thread.setReported(false);
                threadRepository.save(thread);
            });
            case MessageReport.TYPE_THREAD_REPLY -> threadReplyRepository.findById(contentId).ifPresent(reply -> {
                reply.setReported(false);
                threadReplyRepository.save(reply);
            });
            case MessageReport.TYPE_COURSE_REVIEW -> courseRatingRepository.findById(contentId).ifPresent(rating -> {
                if ("flagged".equals(rating.getReviewStatus())) {
                    rating.setReviewStatus("visible");
                    courseRatingRepository.save(rating);
                    reviewService.recomputeCourseRating(rating.getCourseId());
                }
            });
            default -> throw new IllegalArgumentException("Unknown content type: " + report.getContentType());
        }
    }

    /** Legacy rows predate contentType; NULL means chat message. */
    private String contentTypeOf(MessageReport report) {
        String type = report.getContentType();
        return (type == null || type.isBlank()) ? MessageReport.TYPE_MESSAGE : type;
    }

    private String normalizeContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return MessageReport.TYPE_MESSAGE;
        }
        String normalized = contentType.trim().toUpperCase();
        return switch (normalized) {
            case MessageReport.TYPE_MESSAGE, MessageReport.TYPE_THREAD,
                    MessageReport.TYPE_THREAD_REPLY, MessageReport.TYPE_COURSE_REVIEW -> normalized;
            default -> throw new IllegalArgumentException("Unknown content type: " + contentType);
        };
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
