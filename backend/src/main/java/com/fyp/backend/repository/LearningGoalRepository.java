package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.fyp.backend.model.LearningGoal;

public interface LearningGoalRepository extends JpaRepository<LearningGoal, Long> {

    List<LearningGoal> findByUserIdOrderByCreatedAtDesc(Long userId);

    boolean existsByUserIdAndTemplateId(Long userId, Long templateId);
}
