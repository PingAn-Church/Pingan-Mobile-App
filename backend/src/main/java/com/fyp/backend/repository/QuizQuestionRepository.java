package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.QuizQuestion;

@Repository
public interface QuizQuestionRepository extends JpaRepository<QuizQuestion, Long> {
    List<QuizQuestion> findByQuizIdOrderByOrderIndexAsc(Long quizId);

    long countByQuizId(Long quizId);

    void deleteByQuizId(Long quizId);
}
