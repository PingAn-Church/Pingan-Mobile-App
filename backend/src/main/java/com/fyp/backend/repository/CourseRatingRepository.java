package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseRating;

@Repository
public interface CourseRatingRepository extends JpaRepository<CourseRating, Long> {
    Page<CourseRating> findByCourseIdAndReviewStatus(Long courseId, String reviewStatus, Pageable pageable);

    // Declared as List<Object[]> on purpose: a bare Object[] return is treated as a
    // collection query by Spring Data and comes back as a nested single-element array.
    @Query("select avg(r.rating), count(r) from CourseRating r "
            + "where r.courseId = :courseId and r.reviewStatus = 'visible'")
    List<Object[]> visibleRatingSummary(@Param("courseId") Long courseId);

    List<CourseRating> findByUserId(Long userId);

    Optional<CourseRating> findByCourseIdAndUserId(Long courseId, Long userId);

    long countByCourseId(Long courseId);

    long countByUserId(Long userId);

    void deleteByUserId(Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM CourseRating r WHERE r.courseId = :courseId")
    void deleteByCourseId(@Param("courseId") Long courseId);
}
