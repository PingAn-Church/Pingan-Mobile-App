package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseRating;

@Repository
public interface CourseRatingRepository extends JpaRepository<CourseRating, Long> {
    List<CourseRating> findByCourseId(Long courseId);

    List<CourseRating> findByCourseIdAndReviewStatus(Long courseId, String reviewStatus);

    List<CourseRating> findByUserId(Long userId);

    Optional<CourseRating> findByCourseIdAndUserId(Long courseId, Long userId);

    long countByCourseId(Long courseId);

    long countByUserId(Long userId);

    void deleteByUserId(Long userId);
}
