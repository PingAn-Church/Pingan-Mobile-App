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

@Entity
@Table(name = "quiz_attempts")
@Getter
@Setter
@NoArgsConstructor
public class QuizAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Long quizId;

    @ColumnDefault("0")
    private Integer score = 0;

    @ColumnDefault("0")
    private Integer totalQuestions = 0;

    @ColumnDefault("0")
    private Integer correctAnswers = 0;

    private Integer timeTakenMinutes;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isPassed = false;

    /** JSON map of questionId -> submitted answer. */
    @Column(columnDefinition = "text")
    private String answers = "{}";

    @ColumnDefault("1")
    private Integer attemptNumber = 1;

    private Instant startedAt = Instant.now();

    private Instant completedAt;

    /** JSON map of questionId -> manual grade (P6). */
    @Column(columnDefinition = "text")
    private String gradedAnswers = "{}";

    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean gradesReleased = true;
}
