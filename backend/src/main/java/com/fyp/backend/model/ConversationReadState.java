package com.fyp.backend.model;

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
 * How far one person has read in one conversation.
 *
 * This is the read watermark, and it replaces asking a per-recipient row per
 * message whether it has been read. Message ids are identity-generated and
 * therefore strictly increasing, so "unread" is a range: anything in this
 * conversation newer than {@code lastReadMessageId} and not written by this
 * person. Storage is one row per member per conversation instead of one row per
 * member per message — the difference between hundreds of rows and one in the
 * church-wide group.
 *
 * Delivery receipts still exist, but only for private chats, where there is
 * exactly one recipient and the ✓✓ / Seen tick is something people actually look
 * for. Groups show no ticks, the same choice Telegram makes.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "conversation_read_state", uniqueConstraints = {
        @UniqueConstraint(name = "uq_conversation_read_state", columnNames = { "conversation_id", "user_id" })
}, indexes = {
        @Index(name = "idx_conversation_read_state_user", columnList = "user_id")
})
public class ConversationReadState {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "conversation_id", nullable = false)
    private Long conversationId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /**
     * Highest message id this person has been shown here. Null means they have
     * read nothing, which for a member who just joined is corrected on the way
     * in — see ConversationReadStateService#markCaughtUp.
     */
    @Column(name = "last_read_message_id")
    private Long lastReadMessageId;

    public ConversationReadState(Long conversationId, Long userId, Long lastReadMessageId) {
        this.conversationId = conversationId;
        this.userId = userId;
        this.lastReadMessageId = lastReadMessageId;
    }
}
