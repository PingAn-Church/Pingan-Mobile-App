package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.CourseQuiz;
import com.fyp.backend.model.QuizAttempt;
import com.fyp.backend.model.QuizQuestion;
import com.fyp.backend.repository.CourseQuizRepository;
import com.fyp.backend.repository.QuizAttemptRepository;
import com.fyp.backend.repository.QuizQuestionRepository;

/**
 * Unit tests for the quiz auto-grading engine — the migration's highest-risk
 * port. Repositories and progress recompute are mocked; a real ObjectMapper
 * exercises the JSON answer/correct-answer handling.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class QuizServiceTest {

    @Mock private CourseQuizRepository quizRepository;
    @Mock private QuizQuestionRepository questionRepository;
    @Mock private QuizAttemptRepository attemptRepository;
    @Mock private ProgressService progressService;
    @Mock private PushNotificationService pushNotificationService;
    @Mock private AchievementService achievementService;
    @Mock private GoalService goalService;
    @Spy private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks private QuizService quizService;

    private static final long USER = 5L;
    private static final long QUIZ = 1L;

    private CourseQuiz quiz;

    @BeforeEach
    void setUp() {
        quiz = new CourseQuiz();
        quiz.setId(QUIZ);
        quiz.setCourseId(10L);
        quiz.setSectionId(100L);
        quiz.setPassingScore(50);
        quiz.setMaxAttempts(null);
        when(quizRepository.findById(QUIZ)).thenReturn(Optional.of(quiz));
        when(attemptRepository.countByUserIdAndQuizId(USER, QUIZ)).thenReturn(0L);
        when(attemptRepository.save(any(QuizAttempt.class))).thenAnswer(i -> i.getArgument(0));
    }

    private QuizQuestion question(long id, String type, String correctAnswer) {
        QuizQuestion q = new QuizQuestion();
        q.setId(id);
        q.setQuizId(QUIZ);
        q.setQuestion("Q" + id);
        q.setQuestionType(type);
        q.setCorrectAnswer(correctAnswer);
        q.setPoints(1);
        q.setOrderIndex((int) id);
        return q;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> dataOf(Map<String, Object> response) {
        return (Map<String, Object>) response.get("data");
    }

    @Test
    void gradesEveryQuestionTypeCorrectly() {
        when(questionRepository.findByQuizIdOrderByOrderIndexAsc(QUIZ)).thenReturn(List.of(
                question(1, "multiple-choice", "Paris"),
                question(2, "multiple-correct", "[\"A\",\"C\"]"),
                question(3, "true-false", "True"),
                question(4, "short-answer", "Hello World"),
                question(5, "matching", "[{\"left\":\"x\",\"right\":\"1\"},{\"left\":\"y\",\"right\":\"2\"}]")));

        List<Map<String, Object>> answers = List.of(
                Map.of("questionId", "1", "answer", "Paris"),
                Map.of("questionId", "2", "answer", List.of("C", "A")), // order-insensitive
                Map.of("questionId", "3", "answer", "True"),
                Map.of("questionId", "4", "answer", "  hello   WORLD "), // normalized match
                Map.of("questionId", "5", "answer",
                        List.of(Map.of("left", "x", "right", "1"), Map.of("left", "y", "right", "2"))));

        Map<String, Object> data = dataOf(quizService.submitQuiz(USER, QUIZ, answers, null));
        assertEquals(5, data.get("correctAnswers"));
        assertEquals(100, data.get("score"));
        assertEquals(true, data.get("isPassed"));
    }

    @Test
    void marksWrongAndPartialAnswersIncorrect() {
        when(questionRepository.findByQuizIdOrderByOrderIndexAsc(QUIZ)).thenReturn(List.of(
                question(1, "multiple-choice", "Paris"),
                question(2, "multiple-correct", "[\"A\",\"C\"]"),
                question(3, "short-answer", "Yes")));

        List<Map<String, Object>> answers = List.of(
                Map.of("questionId", "1", "answer", "London"),     // wrong
                Map.of("questionId", "2", "answer", List.of("A")), // partial -> wrong
                Map.of("questionId", "3", "answer", "Yes"));       // correct

        Map<String, Object> data = dataOf(quizService.submitQuiz(USER, QUIZ, answers, null));
        assertEquals(1, data.get("correctAnswers"));
        assertEquals(33, data.get("score")); // round(100/3)
        assertEquals(false, data.get("isPassed"));
    }

    @Test
    void rejectsSubmissionWhenMaxAttemptsReached() {
        quiz.setMaxAttempts(1);
        when(attemptRepository.countByUserIdAndQuizId(USER, QUIZ)).thenReturn(1L);
        assertThrows(ApiException.class, () -> quizService.submitQuiz(USER, QUIZ, List.of(), null));
    }
}
