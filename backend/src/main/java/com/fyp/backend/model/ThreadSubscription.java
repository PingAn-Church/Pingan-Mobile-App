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
 * One person following one topic.
 *
 * Topics are silent by default — a forum where every post notifies everybody is
 * a forum people turn off entirely — so this row is what opts somebody in. The
 * author of a topic gets one automatically: they asked the question, so they
 * should hear the answers.
 *
 * {@code lastSeenReplyId} is the read marker behind the badge on the Topics row:
 * anything newer than it, from somebody else, is unread. Ids are strictly
 * increasing, so that is a plain comparison and needs no timestamps.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "thread_subscriptions", uniqueConstraints = {
        @UniqueConstraint(name = "uq_thread_subscription", columnNames = { "thread_id", "user_id" })
}, indexes = {
        @Index(name = "idx_thread_subscriptions_user", columnList = "user_id"),
        @Index(name = "idx_thread_subscriptions_thread", columnList = "thread_id")
})
public class ThreadSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "thread_id", nullable = false)
    private Long threadId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Highest reply this person has been shown; null until they open the topic. */
    @Column(name = "last_seen_reply_id")
    private Long lastSeenReplyId;

    public ThreadSubscription(Long threadId, Long userId, Long lastSeenReplyId) {
        this.threadId = threadId;
        this.userId = userId;
        this.lastSeenReplyId = lastSeenReplyId;
    }
}
