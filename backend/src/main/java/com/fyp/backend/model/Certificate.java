package com.fyp.backend.model;

import java.time.Instant;

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
 * A completion certificate, issued once per (user, course) when the course
 * reaches 100% progress. {@code metadata} holds a JSON snapshot (course title,
 * learner name) so the certificate renders without extra joins.
 */
@Entity
@Table(name = "certificates")
@Getter
@Setter
@NoArgsConstructor
public class Certificate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Long courseId;

    @Column(nullable = false, unique = true)
    private String certificateNumber;

    @Column(columnDefinition = "text")
    private String credentialUrl;

    /** JSON snapshot: { courseTitle, userName }. */
    @Column(columnDefinition = "text")
    private String metadata;

    private Instant issuedAt = Instant.now();
}
