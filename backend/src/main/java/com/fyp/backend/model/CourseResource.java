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
@Table(name = "course_resources")
@Getter
@Setter
@NoArgsConstructor
public class CourseResource {

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

    /** pdf | document | ppt | other */
    private String resourceType;

    @Column(columnDefinition = "text")
    private String resourceUrl;

    private Long fileSizeBytes;

    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean isDownloadable = true;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isPreview = false;

    @ColumnDefault("0")
    private Integer orderIndex = 0;

    @ColumnDefault("0")
    private Integer estimatedReadMinutes = 0;

    private Instant createdAt = Instant.now();

    private Instant updatedAt = Instant.now();
}
