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

    void deleteByUserIdAndCourseId(Long userId, Long courseId);

    void deleteByCourseId(Long courseId);

    void deleteByUserId(Long userId);
}
