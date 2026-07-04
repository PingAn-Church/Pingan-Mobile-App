package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseEnrollment;

@Repository
public interface CourseEnrollmentRepository extends JpaRepository<CourseEnrollment, Long> {
    Optional<CourseEnrollment> findByUserIdAndCourseId(Long userId, Long courseId);

    List<CourseEnrollment> findByUserId(Long userId);

    boolean existsByUserIdAndCourseId(Long userId, Long courseId);

    long countByCourseId(Long courseId);

    long countByCourseIdAndIsCompletedTrue(Long courseId);

    long countByUserIdAndIsCompletedTrue(Long userId);

    long countByUserId(Long userId);

    @Query("select e.courseId, count(e), "
            + "sum(case when e.isCompleted = true then 1 else 0 end), "
            + "avg(coalesce(e.progressPercentage, 0)) "
            + "from CourseEnrollment e where e.courseId in :courseIds group by e.courseId")
    List<Object[]> statsByCourseIds(@Param("courseIds") List<Long> courseIds);

    void deleteByCourseId(Long courseId);

    void deleteByUserId(Long userId);
}
