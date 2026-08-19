package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseWishlist;

@Repository
public interface CourseWishlistRepository extends JpaRepository<CourseWishlist, Long> {
    List<CourseWishlist> findByUserId(Long userId);

    Optional<CourseWishlist> findByUserIdAndCourseId(Long userId, Long courseId);

    boolean existsByUserIdAndCourseId(Long userId, Long courseId);

    /** The subset of these courses the user has wishlisted, in one query. */
    @org.springframework.data.jpa.repository.Query(
            "select w.courseId from CourseWishlist w "
            + "where w.userId = :userId and w.courseId in :courseIds")
    List<Long> findCourseIdsByUserIdAndCourseIdIn(
            @org.springframework.data.repository.query.Param("userId") Long userId,
            @org.springframework.data.repository.query.Param("courseIds") List<Long> courseIds);

    long countByUserId(Long userId);

    void deleteByUserIdAndCourseId(Long userId, Long courseId);

    void deleteByCourseId(Long courseId);

    void deleteByUserId(Long userId);
}
