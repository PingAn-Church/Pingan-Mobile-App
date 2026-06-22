package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.Course;

@Repository
public interface CourseRepository extends JpaRepository<Course, Long> {
    List<Course> findByIsPublishedTrue();

    List<Course> findByIsPublishedTrueAndCategoryId(Long categoryId);

    // Paginated variants used by the published-course listing (DB-side paging/sort).
    Page<Course> findByIsPublishedTrue(Pageable pageable);

    Page<Course> findByIsPublishedTrueAndCategoryId(Long categoryId, Pageable pageable);

    List<Course> findByInstructorId(Long instructorId);

    long countByCategoryId(Long categoryId);
}
