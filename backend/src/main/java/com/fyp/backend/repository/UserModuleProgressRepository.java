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

    long countByUserId(Long userId);

    void deleteByCourseId(Long courseId);

    void deleteByUserId(Long userId);
}
