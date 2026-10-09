package com.fyp.backend.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One person's emoji on one message.
 *
 * The unique triple makes a reaction a toggle: pressing 🙏 twice adds one row
 * and removes it, never two. The emoji is stored in its canonical form (no
 * variation selector, see MessageReactionService.canonical) so "❤" and "❤️"
 * from different keyboards count together.
 *
 * PostgreSQL foreign keys for the scalar ids are installed by
 * DatabaseIntegrityMigration, so deleting a message or an account cascades here.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "message_reactions", uniqueConstraints = {
        @UniqueConstraint(name = "uq_message_reaction", columnNames = { "message_id", "user_id", "emoji" })
}, indexes = {
        @Index(name = "idx_message_reactions_message", columnList = "message_id"),
        @Index(name = "idx_message_reactions_user", columnList = "user_id")
})
public class MessageReaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "message_id", nullable = false)
    private Long messageId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 16)
    private String emoji;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public MessageReaction(Long messageId, Long userId, String emoji, Instant createdAt) {
        this.messageId = messageId;
        this.userId = userId;
        this.emoji = emoji;
        this.createdAt = createdAt;
    }
}
