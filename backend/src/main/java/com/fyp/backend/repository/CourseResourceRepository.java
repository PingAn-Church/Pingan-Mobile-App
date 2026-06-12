package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseResource;

@Repository
public interface CourseResourceRepository extends JpaRepository<CourseResource, Long> {
    List<CourseResource> findByCourseIdOrderByOrderIndexAsc(Long courseId);

    List<CourseResource> findBySectionIdOrderByOrderIndexAsc(Long sectionId);

    long countByCourseId(Long courseId);
}
