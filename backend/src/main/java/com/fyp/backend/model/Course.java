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
@Table(name = "courses")
@Getter
@Setter
@NoArgsConstructor
public class Course {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    private String instructorName = "Instructor";

    private Long instructorId;

    private Long categoryId;

    @ColumnDefault("0")
    private Double durationHours = 0.0;

    @Column(columnDefinition = "text")
    private String thumbnailUrl;

    @ColumnDefault("0")
    private Double rating = 0.0;

    @ColumnDefault("0")
    private Integer totalRatings = 0;

    @ColumnDefault("0")
    private Integer studentCount = 0;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isPublished = false;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isFeatured = false;

    private String language = "EN";

    /** Comma-separated tags; exposed as an array in API responses. */
    @Column(columnDefinition = "text")
    private String tags;

    private Instant createdAt = Instant.now();

    private Instant updatedAt = Instant.now();
}
