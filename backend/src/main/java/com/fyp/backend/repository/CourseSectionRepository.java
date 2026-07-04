package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseSection;

@Repository
public interface CourseSectionRepository extends JpaRepository<CourseSection, Long> {
    List<CourseSection> findByCourseIdOrderByOrderIndexAsc(Long courseId);

    long countByCourseId(Long courseId);

    @Query("select s.courseId, count(s) from CourseSection s where s.courseId in :courseIds group by s.courseId")
    List<Object[]> countByCourseIds(@Param("courseIds") List<Long> courseIds);
}
