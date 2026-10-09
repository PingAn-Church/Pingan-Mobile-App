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
 * One choice on a poll — or, on a sign-up sheet, one person's entry, where
 * {@code createdById} is who added themselves and {@code note} is their "I'll
 * bring the salad". {@code position} is the order the creator (or the sign-ups)
 * gave them; a sign-up sheet numbers its entries from it.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "poll_options", indexes = {
        @Index(name = "idx_poll_options_poll", columnList = "poll_id"),
        @Index(name = "idx_poll_options_created_by", columnList = "created_by_id")
})
public class PollOption {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "poll_id", nullable = false)
    private Long pollId;

    /** Null on a sign-up entry, which is shown as the person's own name. */
    @Column(length = 200)
    private String text;

    @Column(length = 200)
    private String note;

    @Column(nullable = false)
    private int position;

    @Column(name = "created_by_id")
    private Long createdById;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public PollOption(Long pollId, String text, String note, int position, Long createdById, Instant createdAt) {
        this.pollId = pollId;
        this.text = text;
        this.note = note;
        this.position = position;
        this.createdById = createdById;
        this.createdAt = createdAt;
    }
}
