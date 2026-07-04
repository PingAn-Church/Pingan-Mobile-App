package com.fyp.backend.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.Course;

@Repository
public interface CourseRepository extends JpaRepository<Course, Long>, JpaSpecificationExecutor<Course> {
    // Paginated variants used by the published-course listing (DB-side paging/sort).
    Page<Course> findByIsPublishedTrue(Pageable pageable);

    Page<Course> findByIsPublishedTrueAndCategoryId(Long categoryId, Pageable pageable);

    long countByInstructorId(Long instructorId);

    long countByCategoryId(Long categoryId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE Course c SET c.categoryId = :targetCategoryId WHERE c.categoryId = :sourceCategoryId")
    int moveCategory(
            @Param("sourceCategoryId") Long sourceCategoryId,
            @Param("targetCategoryId") Long targetCategoryId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE Course c SET c.instructorId = null, c.instructorName = :deletedName "
            + "WHERE c.instructorId = :instructorId")
    int detachInstructor(
            @Param("instructorId") Long instructorId,
            @Param("deletedName") String deletedName);
}
