package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.fyp.backend.model.GoalTemplate;

public interface GoalTemplateRepository extends JpaRepository<GoalTemplate, Long> {

    List<GoalTemplate> findByIsActiveTrue();

    Optional<GoalTemplate> findByLabelIgnoreCase(String label);
}
