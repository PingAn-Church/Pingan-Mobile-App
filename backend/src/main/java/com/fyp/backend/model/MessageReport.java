package com.fyp.backend.model;

import java.sql.Timestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A user report against a piece of user-generated content: a chat message, a
 * forum thread, a thread reply, or a course review.
 *
 * The reported content's details are SNAPSHOTTED here (content, type, author)
 * rather than referenced with a foreign key, so admins can still review the
 * evidence after the content is deleted — whether by its author or by an admin
 * resolving the report. A resolved piece of content may be reported again only
 * after its reportable content changes.
 *
 * Legacy rows predate contentType and have it NULL; they are message reports
 * (backfilled to MESSAGE by ReportSchemaMigration on startup). The content id
 * lives in the historical message_id column.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "message_reports", indexes = {
        @Index(name = "idx_message_reports_status_reported_at", columnList = "status, reported_at"),
        @Index(name = "idx_message_reports_reported_at", columnList = "reported_at")
})
public class MessageReport {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_RESOLVED = "RESOLVED";

    // DELETE_MESSAGE is kept as the wire value for "delete the reported content"
    // so existing clients keep working; it deletes whatever content type the
    // report points at.
    public static final String ACTION_DEACTIVATE_USER = "DEACTIVATE_USER";
    public static final String ACTION_DELETE_MESSAGE = "DELETE_MESSAGE";
    public static final String ACTION_NO_PROBLEM = "NO_PROBLEM";

    public static final String TYPE_MESSAGE = "MESSAGE";
    public static final String TYPE_THREAD = "THREAD";
    public static final String TYPE_THREAD_REPLY = "THREAD_REPLY";
    public static final String TYPE_COURSE_REVIEW = "COURSE_REVIEW";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** What kind of content this report targets; NULL in legacy rows = MESSAGE. */
    @Column(name = "content_type")
    private String contentType = TYPE_MESSAGE;

    /** Id of the reported content (message/thread/reply/review) in its own table. */
    @Column(name = "message_id", nullable = false)
    private Long contentId;

    // --- snapshot of the reported content ---
    private Long conversationId; // messages only
    private String conversationType; // group / private (messages only)
    private String messageType; // text / image / voice ("text" for non-chat content)
    @Column(columnDefinition = "TEXT")
    private String messageContent;
    @Column(name = "content_fingerprint", length = 80)
    private String contentFingerprint;
    private Long senderId; // the content's author
    private String senderName;

    // --- who reported it ---
    private Long reporterId;
    private String reporterName;
    private Timestamp reportedAt;

    // --- resolution ---
    @Column(nullable = false)
    private String status = STATUS_PENDING;
    private String resolution; // DEACTIVATE_USER / DELETE_MESSAGE / NO_PROBLEM
    private Long resolvedById;
    private String resolvedByName;
    private Timestamp resolvedAt;

    @PrePersist
    void beforeInsert() {
        if (reportedAt == null) {
            reportedAt = new Timestamp(System.currentTimeMillis());
        }
        if (status == null || status.isBlank()) {
            status = STATUS_PENDING;
        }
        if (contentType == null || contentType.isBlank()) {
            contentType = TYPE_MESSAGE;
        }
    }
}
