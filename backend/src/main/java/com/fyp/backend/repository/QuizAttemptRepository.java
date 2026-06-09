package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.QuizAttempt;

@Repository
public interface QuizAttemptRepository extends JpaRepository<QuizAttempt, Long> {
    List<QuizAttempt> findByUserIdAndQuizIdOrderByAttemptNumberDesc(Long userId, Long quizId);

    long countByUserIdAndQuizId(Long userId, Long quizId);

    long countByUserIdAndQuizIdAndIsPassedTrue(Long userId, Long quizId);

    List<QuizAttempt> findByUserIdAndQuizIdIn(Long userId, List<Long> quizIds);

    List<QuizAttempt> findByQuizIdIn(List<Long> quizIds);
}
