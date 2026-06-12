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
 * A badge a learner can earn. {@code criteria} is a JSON rule evaluated after
 * learning events, e.g. {@code {"metric":"courses_completed","threshold":3}}.
 */
@Entity
@Table(name = "achievements")
@Getter
@Setter
@NoArgsConstructor
public class Achievement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "text")
    private String description;

    /** Ionicon name or icon URL. */
    private String icon;

    /** Free-form grouping label, typically the criteria metric. */
    private String type;

    /** JSON rule: { "metric": "...", "threshold": N }. */
    @Column(columnDefinition = "text")
    private String criteria;

    @ColumnDefault("0")
    private Integer points = 0;

    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean isActive = true;

    private Instant createdAt = Instant.now();
}
