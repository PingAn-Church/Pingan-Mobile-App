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
@Table(name = "user_video_progress", uniqueConstraints = @UniqueConstraint(columnNames = { "userId", "videoId" }))
@Getter
@Setter
@NoArgsConstructor
public class UserVideoProgress {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Long videoId;

    @ColumnDefault("0")
    private Integer watchTimeSeconds = 0;

    @ColumnDefault("false")
    @Column(nullable = false)
    private boolean isCompleted = false;

    @ColumnDefault("0")
    private Integer lastPositionSeconds = 0;

    private Instant completedAt;

    private Instant createdAt = Instant.now();

    private Instant updatedAt = Instant.now();
}
