package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseQuiz;

@Repository
public interface CourseQuizRepository extends JpaRepository<CourseQuiz, Long> {
    List<CourseQuiz> findByCourseIdOrderByOrderIndexAsc(Long courseId);

    List<CourseQuiz> findBySectionIdOrderByOrderIndexAsc(Long sectionId);

    long countByCourseId(Long courseId);

    long countBySectionId(Long sectionId);

    @Query("select q.courseId, count(q) from CourseQuiz q where q.courseId in :courseIds group by q.courseId")
    List<Object[]> countByCourseIds(@Param("courseIds") List<Long> courseIds);
}
