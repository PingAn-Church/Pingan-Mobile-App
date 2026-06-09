package com.fyp.backend.model;

import java.time.Instant;

import org.hibernate.annotations.ColumnDefault;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "course_enrollments", uniqueConstraints = @UniqueConstraint(columnNames = { "userId", "courseId" }))
@Getter
@Setter
@NoArgsConstructor
public class CourseEnrollment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Long courseId;

    private Instant enrollmentDate = Instant.now();

    private Instant completionDate;

    @ColumnDefault("0")
    private Double progressPercentage = 0.0;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isCompleted = false;

    @ColumnDefault("0")
    private Integer totalWatchTimeMinutes = 0;

    private Instant updatedAt = Instant.now();

    private Instant lastActivityAt = Instant.now();
}
