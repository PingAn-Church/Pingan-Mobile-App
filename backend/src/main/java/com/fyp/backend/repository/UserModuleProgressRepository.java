package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.UserModuleProgress;

@Repository
public interface UserModuleProgressRepository extends JpaRepository<UserModuleProgress, Long> {
    Optional<UserModuleProgress> findByUserIdAndCourseIdAndSectionId(Long userId, Long courseId, Long sectionId);

    List<UserModuleProgress> findByUserIdAndCourseId(Long userId, Long courseId);

    long countByUserIdAndCourseIdAndIsCompletedTrue(Long userId, Long courseId);

    /** Completed-section counts for many courses at once (enrollment listing). */
    @org.springframework.data.jpa.repository.Query(
            "select p.courseId, count(p) from UserModuleProgress p "
            + "where p.userId = :userId and p.courseId in :courseIds and p.isCompleted = true "
            + "group by p.courseId")
    List<Object[]> countCompletedByUserIdAndCourseIds(
            @org.springframework.data.repository.query.Param("userId") Long userId,
            @org.springframework.data.repository.query.Param("courseIds") List<Long> courseIds);

    long countByUserId(Long userId);

    void deleteByCourseId(Long courseId);

    void deleteByUserId(Long userId);
}
