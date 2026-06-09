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
@Table(name = "course_ratings")
@Getter
@Setter
@NoArgsConstructor
public class CourseRating {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Long courseId;

    @Column(nullable = false)
    private Integer rating;

    @Column(columnDefinition = "text")
    private String review;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isAnonymous = false;

    /** visible | hidden | flagged | resolved (moderation added in P6) */
    @ColumnDefault("'visible'")
    private String reviewStatus = "visible";

    private Long contextSectionId;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isPinned = false;

    @Column(columnDefinition = "text")
    private String instructorReply;

    private Instant createdAt = Instant.now();

    private Instant updatedAt = Instant.now();
}
