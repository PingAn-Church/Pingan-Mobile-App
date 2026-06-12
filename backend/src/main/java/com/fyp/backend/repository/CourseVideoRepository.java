package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseVideo;

@Repository
public interface CourseVideoRepository extends JpaRepository<CourseVideo, Long> {
    List<CourseVideo> findByCourseIdOrderByOrderIndexAsc(Long courseId);

    List<CourseVideo> findBySectionIdOrderByOrderIndexAsc(Long sectionId);

    long countByCourseId(Long courseId);

    long countBySectionId(Long sectionId);
}
