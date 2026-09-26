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
 * One person's choice of one option. The unique triple is what makes a double
 * tap a single vote; a single-choice poll additionally keeps one row per
 * person by replacing the old one (PollService.vote). A sign-up entry carries
 * its owner's vote too, so head counts read the same in every mode.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "poll_votes", uniqueConstraints = {
        @UniqueConstraint(name = "uq_poll_vote", columnNames = { "poll_id", "user_id", "option_id" })
}, indexes = {
        @Index(name = "idx_poll_votes_poll", columnList = "poll_id"),
        @Index(name = "idx_poll_votes_option", columnList = "option_id"),
        @Index(name = "idx_poll_votes_user", columnList = "user_id")
})
public class PollVote {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "poll_id", nullable = false)
    private Long pollId;

    @Column(name = "option_id", nullable = false)
    private Long optionId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public PollVote(Long pollId, Long optionId, Long userId, Instant createdAt) {
        this.pollId = pollId;
        this.optionId = optionId;
        this.userId = userId;
        this.createdAt = createdAt;
    }
}
