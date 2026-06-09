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
@Table(name = "course_videos")
@Getter
@Setter
@NoArgsConstructor
public class CourseVideo {

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

    @Column(columnDefinition = "text")
    private String videoUrl;

    @ColumnDefault("0")
    private Integer durationSeconds = 0;

    @ColumnDefault("0")
    private Integer orderIndex = 0;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isPreview = false;

    @Column(columnDefinition = "text")
    private String thumbnailUrl;

    private Instant createdAt = Instant.now();
}
