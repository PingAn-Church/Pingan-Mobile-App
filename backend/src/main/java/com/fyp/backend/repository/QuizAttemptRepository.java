package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.QuizAttempt;

@Repository
public interface QuizAttemptRepository extends JpaRepository<QuizAttempt, Long> {
    List<QuizAttempt> findByUserIdAndQuizIdOrderByAttemptNumberDesc(Long userId, Long quizId);

    long countByUserIdAndQuizId(Long userId, Long quizId);

    long countByUserId(Long userId);

    long countByUserIdAndQuizIdAndIsPassedTrue(Long userId, Long quizId);

    List<QuizAttempt> findByUserIdAndQuizIdIn(Long userId, List<Long> quizIds);

    List<QuizAttempt> findByQuizIdIn(List<Long> quizIds);

    List<QuizAttempt> findByQuizIdInAndGradesReleasedFalse(List<Long> quizIds);

    // The manual-question EXISTS keeps pages honest: without it, attempts on fully
    // auto-graded quizzes pad totalCount and can leave whole pages empty after the
    // service-side filter.
    @Query("select a from QuizAttempt a "
            + "join CourseQuiz q on q.id = a.quizId "
            + "join Course c on c.id = q.courseId "
            + "where a.gradesReleased = false "
            + "and (:courseId is null or q.courseId = :courseId) "
            + "and (:admin = true or c.instructorId = :instructorId) "
            + "and exists (select 1 from QuizQuestion qq "
            + "where qq.quizId = q.id and qq.questionType in :manualTypes) "
            + "order by a.completedAt asc, a.id asc")
    Page<QuizAttempt> findPendingGrading(@Param("admin") boolean admin,
            @Param("instructorId") Long instructorId,
            @Param("courseId") Long courseId,
            @Param("manualTypes") List<String> manualTypes,
            Pageable pageable);

    /** Number of distinct quizzes the user has passed at least once. */
    @Query("select count(distinct a.quizId) from QuizAttempt a where a.userId = :userId and a.isPassed = true")
    long countDistinctPassedQuizzes(@Param("userId") Long userId);

    /** Account-deletion cleanup: drop every attempt by a user. */
    void deleteByUserId(Long userId);
}
