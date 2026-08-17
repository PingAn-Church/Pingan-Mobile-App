package com.fyp.backend.service;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.dto.ReportDto;
import com.fyp.backend.dto.ReportResolutionDto;
import com.fyp.backend.dto.ModerationEvent;
import com.fyp.backend.model.CourseRating;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageReport;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.MessageReportRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.ContentFingerprint;

import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;

/**
 * Content reporting: any user can flag another user's current content — a chat
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
    private final CourseRepository courseRepository;
    private final UserService userService;
    private final ConversationService conversationService;
    private final ChatService chatService;
    private final ReviewService reviewService;
    private final ModerationEventPublisher moderationEventPublisher;
    private final ThreadContentCleanupService threadContentCleanupService;

    public MessageReportService(MessageReportRepository messageReportRepository,
            MessageRepository messageRepository,
            ThreadRepository threadRepository,
            ThreadReplyRepository threadReplyRepository,
            CourseRatingRepository courseRatingRepository,
            UserRepository userRepository,
            CourseRepository courseRepository,
            UserService userService,
            ConversationService conversationService,
            ChatService chatService,
            ReviewService reviewService,
            ModerationEventPublisher moderationEventPublisher,
            ThreadContentCleanupService threadContentCleanupService) {
        this.messageReportRepository = messageReportRepository;
        this.messageRepository = messageRepository;
        this.threadRepository = threadRepository;
        this.threadReplyRepository = threadReplyRepository;
        this.courseRatingRepository = courseRatingRepository;
        this.userRepository = userRepository;
        this.courseRepository = courseRepository;
        this.userService = userService;
        this.conversationService = conversationService;
        this.chatService = chatService;
        this.reviewService = reviewService;
        this.moderationEventPublisher = moderationEventPublisher;
        this.threadContentCleanupService = threadContentCleanupService;
    }

    /** Legacy entry point: report a chat message. */
    @Transactional
    public MessageReport createReport(Long messageId, Long reporterId) {
        return createReport(MessageReport.TYPE_MESSAGE, messageId, reporterId);
    }

    @Transactional
    public MessageReport createReport(String contentType, Long contentId, Long reporterId) {
        String type = normalizeContentType(contentType);

        MessageReport report = new MessageReport();
        report.setContentType(type);
        report.setContentId(contentId);
        report.setMessageType("text");

        // Snapshot the content + author, reject self-reports, and shadow-hide the
        // content (its author keeps seeing the original) until an admin resolves.
        switch (type) {
            case MessageReport.TYPE_MESSAGE -> {
                Message message = messageRepository.findByIdForUpdate(contentId)
                        .orElseThrow(() -> new IllegalArgumentException("Message not found."));
                Long conversationId = message.getConversation() != null ? message.getConversation().getId() : null;
                if (conversationId == null
                        || !conversationService.isUserPartOfConversation(conversationId, reporterId)) {
                    throw new org.springframework.security.access.AccessDeniedException(
                            "You are not a participant in this conversation.");
                }
                applyAuthor(report, message.getSender(), reporterId, "message");
                report.setConversationId(conversationId);
                report.setConversationType(message.getConversationType());
                report.setMessageType(message.getType());
                report.setMessageContent(message.getContent());
                rejectDuplicate(type, contentId,
                        canonicalMessage(message),
                        report.getMessageType(),
                        report.getMessageContent());
                if (Boolean.TRUE.equals(message.getReported())) {
                    throw new IllegalStateException("This content is already pending review.");
                }
                report.setContentFingerprint(ContentFingerprint.current(type, canonicalMessage(message)));
                message.setReported(true);
                messageRepository.save(message);
            }
            case MessageReport.TYPE_THREAD -> {
                Thread thread = threadRepository.findByIdForUpdate(contentId)
                        .orElseThrow(() -> new IllegalArgumentException("Thread not found."));
                applyAuthor(report, thread.getCreatedBy(), reporterId, "thread");
                report.setMessageContent(joinTitleAndBody(thread.getTitle(), thread.getContent()));
                report.setThreadId(thread.getId());
                rejectDuplicate(type, contentId,
                        canonicalThread(thread),
                        report.getMessageType(),
                        report.getMessageContent());
                if (Boolean.TRUE.equals(thread.getReported())) {
                    throw new IllegalStateException("This content is already pending review.");
                }
                report.setContentFingerprint(ContentFingerprint.current(type, canonicalThread(thread)));
                thread.setReported(true);
                threadRepository.save(thread);
            }
            case MessageReport.TYPE_THREAD_REPLY -> {
                ThreadReply reply = threadReplyRepository.findByIdForUpdate(contentId)
                        .orElseThrow(() -> new IllegalArgumentException("Reply not found."));
                applyAuthor(report, reply.getAuthor(), reporterId, "reply");
                report.setMessageContent(reply.getContent());
                report.setThreadId(reply.getThread() != null ? reply.getThread().getId() : null);
                rejectDuplicate(type, contentId,
                        canonicalReply(reply),
                        report.getMessageType(),
                        report.getMessageContent());
                if (Boolean.TRUE.equals(reply.getReported())) {
                    throw new IllegalStateException("This content is already pending review.");
                }
                report.setContentFingerprint(ContentFingerprint.current(type, canonicalReply(reply)));
                reply.setReported(true);
                threadReplyRepository.save(reply);
            }
            case MessageReport.TYPE_COURSE_REVIEW -> {
                CourseRating rating = courseRatingRepository.findByIdForUpdate(contentId)
                        .orElseThrow(() -> new IllegalArgumentException("Review not found."));
                if (!"visible".equals(rating.getReviewStatus())
                        || courseRepository.findByIdAndIsPublishedTrue(rating.getCourseId()).isEmpty()) {
                    throw new IllegalArgumentException("Review is not available for reporting.");
                }
                User author = rating.getUserId() == null ? null
                        : userRepository.findById(rating.getUserId()).orElse(null);
                applyAuthor(report, author, reporterId, "review");
                report.setMessageContent(rating.getRating() + "/5 - " + (rating.getReview() == null ? "" : rating.getReview()));
                report.setCourseId(rating.getCourseId());
                rejectDuplicate(type, contentId,
                        canonicalReview(rating),
                        report.getMessageType(),
                        report.getMessageContent());
                report.setContentFingerprint(ContentFingerprint.current(type, canonicalReview(rating)));
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

        MessageReport saved = messageReportRepository.save(report);
        moderationEventPublisher.publishAfterCommit(eventFor(saved, ModerationEvent.STATE_PENDING));
        return saved;
    }

    private void rejectDuplicate(String type, Long contentId, String canonicalContent,
            String messageType, String snapshot) {
        List<String> fingerprints = List.of(
                ContentFingerprint.current(type, canonicalContent),
                ContentFingerprint.legacy(type, messageType, snapshot));
        if (messageReportRepository.existsByContentTypeAndContentIdAndContentFingerprintIn(
                type, contentId, fingerprints)) {
            throw new IllegalStateException("This version of the content has already been reported.");
        }
    }

    private String canonicalMessage(Message message) {
        return safe(message.getType()) + "\n" + safe(message.getContent());
    }

    private String canonicalThread(Thread thread) {
        return safe(thread.getTitle()) + "\n" + safe(thread.getContent());
    }

    private String canonicalReply(ThreadReply reply) {
        return safe(reply.getContent());
    }

    private String canonicalReview(CourseRating rating) {
        return rating.getRating() + "\n" + safe(rating.getReview()) + "\n" + rating.isAnonymous();
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
    public ReportResolutionDto resolveReport(Long reportId, String action, Long adminId) {
        MessageReport report = messageReportRepository.findById(reportId)
                .orElseThrow(() -> new IllegalArgumentException("Report not found."));

        if (!MessageReport.STATUS_PENDING.equals(report.getStatus())) {
            throw new IllegalStateException("This report has already been resolved.");
        }

        User admin = userRepository.findById(adminId)
                .orElseThrow(() -> new IllegalArgumentException("Admin not found."));
        Timestamp resolvedAt = new Timestamp(System.currentTimeMillis());
        Set<Long> affectedReportIds = new LinkedHashSet<>();
        Long deactivatedUserId = null;

        switch (action) {
            case MessageReport.ACTION_DEACTIVATE_USER -> {
                if (report.getSenderId() == null) {
                    throw new IllegalArgumentException("The author of this content no longer exists.");
                }
                Long targetUserId = report.getSenderId();
                User target = userRepository.findById(targetUserId)
                        .orElseThrow(() -> new IllegalArgumentException("The author of this content no longer exists."));
                if (target.isAdmin()) {
                    throw new IllegalArgumentException("Downgrade this admin before deactivating the account.");
                }

                List<MessageReport> targetReports = new ArrayList<>(
                        messageReportRepository.findBySenderIdAndStatus(
                                targetUserId, MessageReport.STATUS_PENDING));
                targetReports.removeIf(pending -> pending.getId().equals(report.getId()));
                targetReports.add(report);
                Map<String, MessageReport> uniqueContent = new LinkedHashMap<>();
                for (MessageReport pending : targetReports) {
                    uniqueContent.putIfAbsent(contentKey(pending), pending);
                }

                Set<Long> cascadeReportIds = new LinkedHashSet<>();
                for (MessageReport pending : uniqueContent.values()) {
                    cascadeReportIds.addAll(deleteReportedContent(pending));
                }

                for (MessageReport pending : targetReports) {
                    resolveRecord(pending, MessageReport.ACTION_DEACTIVATE_USER, admin, resolvedAt);
                    affectedReportIds.add(pending.getId());
                }
                resolveCascadeReports(cascadeReportIds, targetUserId, admin, resolvedAt, affectedReportIds);

                userService.updateUserActiveStatus(targetUserId, false);
                deactivatedUserId = targetUserId;
            }
            case MessageReport.ACTION_DELETE_MESSAGE -> {
                Set<Long> cascadeReportIds = deleteReportedContent(report);
                resolveRecord(report, action, admin, resolvedAt);
                affectedReportIds.add(report.getId());
                resolveCascadeReports(cascadeReportIds, null, admin, resolvedAt, affectedReportIds);
            }
            case MessageReport.ACTION_NO_PROBLEM -> restoreReportedContent(report);
            default -> throw new IllegalArgumentException("Unknown resolve action: " + action);
        }

        if (MessageReport.ACTION_NO_PROBLEM.equals(action)) {
            resolveRecord(report, action, admin, resolvedAt);
            affectedReportIds.add(report.getId());
        }

        return ReportResolutionDto.builder()
                .report(ReportDto.from(report))
                .affectedReportIds(List.copyOf(affectedReportIds))
                .deactivatedUserId(deactivatedUserId)
                .build();
    }

    private void resolveCascadeReports(Set<Long> reportIds, Long deactivatedUserId,
            User admin, Timestamp resolvedAt, Set<Long> affectedReportIds) {
        for (Long id : reportIds) {
            MessageReport cascade = messageReportRepository.findById(id).orElse(null);
            if (cascade == null || !MessageReport.STATUS_PENDING.equals(cascade.getStatus())) {
                continue;
            }
            String resolution = deactivatedUserId != null && deactivatedUserId.equals(cascade.getSenderId())
                    ? MessageReport.ACTION_DEACTIVATE_USER
                    : MessageReport.ACTION_DELETE_MESSAGE;
            resolveRecord(cascade, resolution, admin, resolvedAt);
            affectedReportIds.add(cascade.getId());
        }
    }

    private void resolveRecord(MessageReport report, String resolution, User admin, Timestamp resolvedAt) {
        report.setStatus(MessageReport.STATUS_RESOLVED);
        report.setResolution(resolution);
        report.setResolvedById(admin.getId());
        report.setResolvedByName(fullName(admin));
        report.setResolvedAt(resolvedAt);
        messageReportRepository.save(report);
    }

    /**
     * Deletes the reported content. It may already be gone (author deleted it);
     * the report is still resolvable — the offending content no longer exists
     * either way.
     */
    private Set<Long> deleteReportedContent(MessageReport report) {
        Long contentId = report.getContentId();
        Set<Long> cascadeReportIds = new LinkedHashSet<>();
        switch (contentTypeOf(report)) {
            case MessageReport.TYPE_MESSAGE -> {
                if (messageRepository.existsById(contentId)) {
                    chatService.deleteMessageAndBroadcast(contentId);
                }
                moderationEventPublisher.publishAfterCommit(
                        eventFor(report, ModerationEvent.STATE_DELETED));
            }
            case MessageReport.TYPE_THREAD -> {
                moderationEventPublisher.publishAfterCommit(
                        eventFor(report, ModerationEvent.STATE_DELETED));
                List<Long> replyIds = threadContentCleanupService.deleteThreadById(contentId);
                if (!replyIds.isEmpty()) {
                    messageReportRepository.findByContentTypeAndContentIdInAndStatus(
                            MessageReport.TYPE_THREAD_REPLY,
                            replyIds,
                            MessageReport.STATUS_PENDING)
                            .forEach(pending -> cascadeReportIds.add(pending.getId()));
                }
            }
            case MessageReport.TYPE_THREAD_REPLY -> {
                moderationEventPublisher.publishAfterCommit(
                        eventFor(report, ModerationEvent.STATE_DELETED));
                threadContentCleanupService.deleteReplyById(contentId);
            }
            case MessageReport.TYPE_COURSE_REVIEW -> courseRatingRepository.findById(contentId)
                    .ifPresent(rating -> {
                        courseRatingRepository.delete(rating);
                        reviewService.recomputeCourseRating(rating.getCourseId());
                    });
            default -> throw new IllegalArgumentException("Unknown content type: " + report.getContentType());
        }
        if (MessageReport.TYPE_COURSE_REVIEW.equals(contentTypeOf(report))) {
            moderationEventPublisher.publishAfterCommit(
                    eventFor(report, ModerationEvent.STATE_DELETED));
        }
        return cascadeReportIds;
    }

    /** "No problem": lift the pending-review shadow so the content shows again. */
    private void restoreReportedContent(MessageReport report) {
        Long contentId = report.getContentId();
        switch (contentTypeOf(report)) {
            case MessageReport.TYPE_MESSAGE -> messageRepository.findById(contentId).ifPresent(message -> {
                message.setReported(false);
                messageRepository.save(message);
                moderationEventPublisher.publishAfterCommit(
                        eventFor(report, ModerationEvent.STATE_RESTORED));
                chatService.broadcastMessageAfterCommit(message);
            });
            case MessageReport.TYPE_THREAD -> threadRepository.findById(contentId).ifPresent(thread -> {
                thread.setReported(false);
                threadRepository.save(thread);
                moderationEventPublisher.publishAfterCommit(
                        eventFor(report, ModerationEvent.STATE_RESTORED));
            });
            case MessageReport.TYPE_THREAD_REPLY -> threadReplyRepository.findById(contentId).ifPresent(reply -> {
                reply.setReported(false);
                threadReplyRepository.save(reply);
                moderationEventPublisher.publishAfterCommit(
                        eventFor(report, ModerationEvent.STATE_RESTORED));
            });
            case MessageReport.TYPE_COURSE_REVIEW -> courseRatingRepository.findById(contentId).ifPresent(rating -> {
                if ("flagged".equals(rating.getReviewStatus())) {
                    rating.setReviewStatus("visible");
                    courseRatingRepository.save(rating);
                    reviewService.recomputeCourseRating(rating.getCourseId());
                    moderationEventPublisher.publishAfterCommit(
                            eventFor(report, ModerationEvent.STATE_RESTORED));
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

    private String contentKey(MessageReport report) {
        return contentTypeOf(report) + ":" + report.getContentId();
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private ModerationEvent eventFor(MessageReport report, String state) {
        return ModerationEvent.builder()
                .contentType(contentTypeOf(report))
                .contentId(report.getContentId())
                .state(state)
                .conversationId(report.getConversationId())
                .conversationType(report.getConversationType())
                .threadId(report.getThreadId())
                .courseId(report.getCourseId())
                .build();
    }
}
