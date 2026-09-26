package com.fyp.backend.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A poll or a sign-up sheet, attached to exactly one chat message.
 *
 * Three modes share the tables: SINGLE (one choice each), MULTI (any number)
 * and SIGNUP — the "接龙" list, where the options are the people who added
 * themselves, in the order they did. The message points nowhere; the poll
 * points at its message, and goes with it when the message is deleted (the
 * cascading key is installed by DatabaseIntegrityMigration).
 *
 * A deadline closes the poll by being in the past; nothing has to run to close
 * it. {@code closedAt} is the creator or an admin closing it early.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "polls", indexes = {
        @Index(name = "idx_polls_message", columnList = "message_id"),
        @Index(name = "idx_polls_conversation", columnList = "conversation_id")
})
public class Poll {

    public static final String SINGLE = "SINGLE";
    public static final String MULTI = "MULTI";
    public static final String SIGNUP = "SIGNUP";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Set once the message is saved (ChatService.createPoll); unique per message. */
    @Column(name = "message_id", unique = true)
    private Long messageId;

    @Column(name = "conversation_id", nullable = false)
    private Long conversationId;

    @Column(name = "creator_id")
    private Long creatorId;

    @Column(nullable = false, length = 300)
    private String question;

    @Column(nullable = false, length = 16)
    private String mode;

    @Column(nullable = false)
    private boolean anonymous;

    private Instant deadline;

    /** SIGNUP only: how many may add themselves; null means no limit. */
    @Column(name = "max_entries")
    private Integer maxEntries;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public boolean isSignup() {
        return SIGNUP.equals(mode);
    }
}
