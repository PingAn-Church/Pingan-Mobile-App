package com.fyp.backend.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** The latest completed spiritual-gifts assessment for one user. */
@Entity
@Table(name = "spiritual_gift_results")
@Getter
@Setter
@NoArgsConstructor
public class SpiritualGiftResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(name = "assessment_version", nullable = false, length = 16)
    private String assessmentVersion;

    /** JSON array of 25 integer totals. Individual answers are never persisted. */
    @Column(name = "scores_json", nullable = false, length = 128)
    private String scoresJson;

    @Column(name = "completed_at", nullable = false)
    private Instant completedAt;
}
