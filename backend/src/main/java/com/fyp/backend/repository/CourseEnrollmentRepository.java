package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseEnrollment;

@Repository
public interface CourseEnrollmentRepository extends JpaRepository<CourseEnrollment, Long> {
    Optional<CourseEnrollment> findByUserIdAndCourseId(Long userId, Long courseId);

    List<CourseEnrollment> findByUserId(Long userId);

    List<CourseEnrollment> findByCourseId(Long courseId);

    boolean existsByUserIdAndCourseId(Long userId, Long courseId);

    long countByCourseId(Long courseId);

    long countByCourseIdAndIsCompletedTrue(Long courseId);

    long countByUserIdAndIsCompletedTrue(Long userId);

    void deleteByCourseId(Long courseId);
}
