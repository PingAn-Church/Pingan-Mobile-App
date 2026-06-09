package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.Course;

@Repository
public interface CourseRepository extends JpaRepository<Course, Long> {
    List<Course> findByIsPublishedTrue();

    List<Course> findByIsPublishedTrueAndCategoryId(Long categoryId);

    List<Course> findByInstructorId(Long instructorId);

    long countByCategoryId(Long categoryId);
}
