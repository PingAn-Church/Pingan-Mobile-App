package com.fyp.backend.model;

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

/** One row per (user, day): minutes spent learning and number of activities. */
@Entity
@Table(name = "user_analytics", uniqueConstraints = @UniqueConstraint(columnNames = {"userId", "activityDate"}))
@Getter
@Setter
@NoArgsConstructor
public class UserAnalytics {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    /** ISO yyyy-MM-dd in the user's timezone. */
    @Column(nullable = false)
    private String activityDate;

    @ColumnDefault("0")
    private Integer minutesSpent = 0;

    @ColumnDefault("0")
    private Integer activitiesCount = 0;
}
