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

/** A predefined goal a learner can adopt (e.g. "Complete 3 courses"). */
@Entity
@Table(name = "goal_templates")
@Getter
@Setter
@NoArgsConstructor
public class GoalTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String label;

    private String difficulty;

    @Column(nullable = false)
    private String metric;

    @ColumnDefault("0")
    private Integer targetValue = 0;

    @ColumnDefault("0")
    private Integer rewardPoints = 0;

    @ColumnDefault("true")
    @Column(nullable = false)
    private boolean isActive = true;
}
