package com.fyp.backend.model;

import java.time.Instant;

import org.hibernate.annotations.ColumnDefault;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A learner-selected target. {@code metric} is one of
 * {@code courses_completed | quizzes_passed | minutes_spent}; progress is
 * recomputed from the user's activity and the goal completes when
 * {@code currentValue >= targetValue}.
 */
@Entity
@Table(name = "learning_goals")
@Getter
@Setter
@NoArgsConstructor
public class LearningGoal {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String label;

    @Column(nullable = false)
    private String metric;

    @ColumnDefault("0")
    private Integer targetValue = 0;

    @ColumnDefault("0")
    private Integer currentValue = 0;

    @ColumnDefault("0")
    private Integer rewardPoints = 0;

    private String deadline;

    private Long templateId;

    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean isActive = true;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isCompleted = false;

    private Instant createdAt = Instant.now();

    private Instant completedAt;
}
