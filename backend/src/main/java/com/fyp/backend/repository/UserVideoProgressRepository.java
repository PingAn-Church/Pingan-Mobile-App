package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.UserVideoProgress;

@Repository
public interface UserVideoProgressRepository extends JpaRepository<UserVideoProgress, Long> {
    Optional<UserVideoProgress> findByUserIdAndVideoId(Long userId, Long videoId);

    List<UserVideoProgress> findByUserIdAndVideoIdIn(Long userId, List<Long> videoIds);

    long countByUserIdAndVideoIdInAndIsCompletedTrue(Long userId, List<Long> videoIds);

    /**
     * Completed-video counts per course for many courses at once. Progress rows
     * only store videoId, so the course comes from joining CourseVideo.
     */
    @org.springframework.data.jpa.repository.Query(
            "select v.courseId, count(p) from UserVideoProgress p, CourseVideo v "
            + "where p.videoId = v.id and p.userId = :userId "
            + "and v.courseId in :courseIds and p.isCompleted = true "
            + "group by v.courseId")
    List<Object[]> countCompletedByUserIdAndCourseIds(
            @org.springframework.data.repository.query.Param("userId") Long userId,
            @org.springframework.data.repository.query.Param("courseIds") List<Long> courseIds);

    long countByUserId(Long userId);

    void deleteByVideoIdIn(List<Long> videoIds);

    void deleteByUserId(Long userId);
}
