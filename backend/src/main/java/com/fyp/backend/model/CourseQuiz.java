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
@Table(name = "course_quizzes")
@Getter
@Setter
@NoArgsConstructor
public class CourseQuiz {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long courseId;

    private Long sectionId;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    @ColumnDefault("0")
    private Integer orderIndex = 0;

    @ColumnDefault("70")
    private Integer passingScore = 70;

    private Integer timeLimitMinutes;

    /** null = unlimited attempts */
    private Integer maxAttempts;

    private Instant createdAt = Instant.now();
}
