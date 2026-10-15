package com.fyp.backend.model;

import java.sql.Timestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A user's "pin to top" for one conversation in their own chat list. Purely a
 * per-person ordering preference: nothing about the conversation changes and
 * nobody else's list moves. Modelled on {@link ConversationMute}.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "conversation_pins", uniqueConstraints = @UniqueConstraint(
        columnNames = { "user_id", "conversation_id", "conversation_type" }))
public class ConversationPin {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "conversation_id", nullable = false)
    private Long conversationId;

    @Column(name = "conversation_type", nullable = false)
    private String conversationType;

    /** When it was pinned; the list keeps the most recently pinned on top. */
    @Column(name = "created_at")
    private Timestamp createdAt;

    public ConversationPin(Long userId, Long conversationId, String conversationType) {
        this.userId = userId;
        this.conversationId = conversationId;
        this.conversationType = conversationType;
        this.createdAt = new Timestamp(System.currentTimeMillis());
    }
}
