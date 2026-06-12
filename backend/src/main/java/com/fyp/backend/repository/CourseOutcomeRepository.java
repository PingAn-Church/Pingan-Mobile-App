package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseOutcome;

@Repository
public interface CourseOutcomeRepository extends JpaRepository<CourseOutcome, Long> {
    List<CourseOutcome> findByCourseIdOrderByOrderIndexAsc(Long courseId);
}
