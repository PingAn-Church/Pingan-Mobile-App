package com.fyp.backend.model;

import java.sql.Timestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A user report against a chat message.
 *
 * The reported message's details are SNAPSHOTTED here (content, type, sender,
 * conversation) rather than referenced with a foreign key, so admins can still
 * review the evidence after the message is deleted — whether by the sender or
 * by an admin resolving the report. message_id is unique: a message can only
 * ever be reported once.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "message_reports")
public class MessageReport {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_RESOLVED = "RESOLVED";

    public static final String ACTION_DEACTIVATE_USER = "DEACTIVATE_USER";
    public static final String ACTION_DELETE_MESSAGE = "DELETE_MESSAGE";
    public static final String ACTION_NO_PROBLEM = "NO_PROBLEM";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "message_id", nullable = false, unique = true)
    private Long messageId;

    // --- snapshot of the reported message ---
    private Long conversationId;
    private String conversationType; // group / private
    private String messageType; // text / image / voice
    @Column(columnDefinition = "TEXT")
    private String messageContent;
    private Long senderId;
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
}
