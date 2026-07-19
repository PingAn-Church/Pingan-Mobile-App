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
 * A user's notification mute for one conversation. While a row exists the user
 * still receives and reads messages normally — they just get no push
 * notifications for that conversation. App-wide notifications are unaffected.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "conversation_mutes", uniqueConstraints = @UniqueConstraint(
        columnNames = { "user_id", "conversation_id", "conversation_type" }))
public class ConversationMute {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "conversation_id", nullable = false)
    private Long conversationId;

    @Column(name = "conversation_type", nullable = false)
    private String conversationType;

    private Timestamp createdAt;

    public ConversationMute(Long userId, Long conversationId, String conversationType) {
        this.userId = userId;
        this.conversationId = conversationId;
        this.conversationType = conversationType;
        this.createdAt = new Timestamp(System.currentTimeMillis());
    }
}
