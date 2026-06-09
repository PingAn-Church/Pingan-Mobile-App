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
@Table(name = "quiz_questions")
@Getter
@Setter
@NoArgsConstructor
public class QuizQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long quizId;

    @Column(columnDefinition = "text", nullable = false)
    private String question;

    /** multiple-choice | multiple-correct | true-false | short-answer | matching */
    @Column(nullable = false)
    private String questionType;

    /** JSON-encoded options (array of strings, or matching pairs). */
    @Column(columnDefinition = "text")
    private String options;

    /** Plain string, or JSON for multiple-correct / matching. */
    @Column(columnDefinition = "text")
    private String correctAnswer;

    @Column(columnDefinition = "text")
    private String explanation;

    @ColumnDefault("1")
    private Integer points = 1;

    @ColumnDefault("0")
    private Integer orderIndex = 0;

    @Column(columnDefinition = "text")
    private String imageUrl;

    /** JSON map of instructor-graded short-answer variations (P6). */
    @Column(columnDefinition = "text")
    private String gradedVariations = "{}";

    private Instant createdAt = Instant.now();
}
