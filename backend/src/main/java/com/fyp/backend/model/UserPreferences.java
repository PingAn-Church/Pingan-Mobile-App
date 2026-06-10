package com.fyp.backend.model;

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
 * Per-user learning preferences plus streak bookkeeping. The timezone drives
 * the daily-streak / daily-minute math.
 */
@Entity
@Table(name = "user_preferences")
@Getter
@Setter
@NoArgsConstructor
public class UserPreferences {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private Long userId;

    private String timezone = "UTC";

    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean emailNotifications = true;

    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean pushNotifications = true;

    private String themePreference = "system";

    @ColumnDefault("0")
    private Integer currentStreak = 0;

    @ColumnDefault("0")
    private Integer longestStreak = 0;

    /** Last activity day in the user's timezone, ISO yyyy-MM-dd. */
    private String lastActivityDate;
}
