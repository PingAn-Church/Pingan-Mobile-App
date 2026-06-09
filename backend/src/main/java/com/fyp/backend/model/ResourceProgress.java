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
@Table(name = "resource_progress", uniqueConstraints = @UniqueConstraint(columnNames = { "userId", "resourceId" }))
@Getter
@Setter
@NoArgsConstructor
public class ResourceProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Long resourceId;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isCompleted = false;

    private Instant completedAt;

    private Instant createdAt = Instant.now();

    private Instant updatedAt = Instant.now();
}
