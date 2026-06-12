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
@Table(name = "user_module_progress", uniqueConstraints = @UniqueConstraint(columnNames = { "userId", "courseId",
        "sectionId" }))
@Getter
@Setter
@NoArgsConstructor
public class UserModuleProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Long courseId;

    @Column(nullable = false)
    private Long sectionId;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isCompleted = false;

    private Instant completedAt;
}
