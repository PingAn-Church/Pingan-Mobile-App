package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseQuiz;

@Repository
public interface CourseQuizRepository extends JpaRepository<CourseQuiz, Long> {
    List<CourseQuiz> findByCourseIdOrderByOrderIndexAsc(Long courseId);

    List<CourseQuiz> findBySectionIdOrderByOrderIndexAsc(Long sectionId);

    long countByCourseId(Long courseId);

    long countBySectionId(Long sectionId);
}
