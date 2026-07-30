package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.CourseVideo;

@Repository
public interface CourseVideoRepository extends JpaRepository<CourseVideo, Long> {
    boolean existsByVideoUrlContainingOrThumbnailUrlContaining(String videoFragment, String thumbnailFragment);
    List<CourseVideo> findByCourseIdOrderByOrderIndexAsc(Long courseId);

    List<CourseVideo> findBySectionIdOrderByOrderIndexAsc(Long sectionId);

    long countByCourseId(Long courseId);

    long countBySectionId(Long sectionId);

    @Query("select v.courseId, count(v) from CourseVideo v where v.courseId in :courseIds group by v.courseId")
    List<Object[]> countByCourseIds(@Param("courseIds") List<Long> courseIds);
}
