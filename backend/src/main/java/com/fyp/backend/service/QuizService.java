package com.fyp.backend.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.CourseQuiz;
import com.fyp.backend.model.QuizAttempt;
import com.fyp.backend.model.QuizQuestion;
import com.fyp.backend.repository.CourseQuizRepository;
import com.fyp.backend.repository.QuizAttemptRepository;
import com.fyp.backend.repository.QuizQuestionRepository;

/**
 * Quiz delivery + auto-grading engine (P5). Grades multiple-choice,
 * multiple-correct, true-false, matching and short-answer questions, records the
 * attempt and recomputes course/module progress. Manual short-answer grading and
 * credits are layered on in P6/P7.
 */
@Service
public class QuizService {

    @Autowired private CourseQuizRepository quizRepository;
    @Autowired private QuizQuestionRepository questionRepository;
    @Autowired private QuizAttemptRepository attemptRepository;
    @Autowired private ProgressService progressService;
    @Autowired private PushNotificationService pushNotificationService;
    @Autowired private AchievementService achievementService;
    @Autowired private GoalService goalService;
    @Autowired private ObjectMapper objectMapper;

    public Map<String, Object> getQuizDetail(Long quizId, Long userId) {
        CourseQuiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> ApiException.notFound("Quiz not found"));
        List<QuizQuestion> questions = questionRepository.findByQuizIdOrderByOrderIndexAsc(quizId);

        long used = attemptRepository.countByUserIdAndQuizId(userId, quizId);
        Integer maxAttempts = quiz.getMaxAttempts();
        Integer remaining = maxAttempts == null ? null : (int) Math.max(0, maxAttempts - used);

        List<Map<String, Object>> qList = new ArrayList<>();
        for (QuizQuestion q : questions) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", String.valueOf(q.getId()));
            m.put("question", q.getQuestion());
            m.put("question_type", q.getQuestionType());
            m.put("options", parseJsonOrNull(q.getOptions()));
            m.put("points", q.getPoints());
            m.put("order_index", q.getOrderIndex());
            m.put("image_url", q.getImageUrl());
            // Matching questions: expose the prompts (left, in order) and a shuffled
            // set of choices (right) without revealing the correct pairing.
            if ("matching".equals(q.getQuestionType())) {
                addMatchingDisplay(m, q);
            }
            qList.add(m);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", String.valueOf(quiz.getId()));
        data.put("course_id", String.valueOf(quiz.getCourseId()));
        data.put("section_id", quiz.getSectionId() == null ? null : String.valueOf(quiz.getSectionId()));
        data.put("title", quiz.getTitle());
        data.put("description", quiz.getDescription());
        data.put("passing_score", quiz.getPassingScore());
        data.put("time_limit_minutes", quiz.getTimeLimitMinutes());
        data.put("max_attempts", maxAttempts);
        data.put("attempts_used", used);
        data.put("attempts_remaining", remaining);
        data.put("questions", qList);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("data", data);
        return response;
    }

    @Transactional
    public Map<String, Object> submitQuiz(Long userId, Long quizId, List<Map<String, Object>> answers,
            Integer timeTakenMinutes) {
        CourseQuiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> ApiException.notFound("Quiz not found"));
        if (answers == null) throw ApiException.badRequest("answers are required");

        long previousAttempts = attemptRepository.countByUserIdAndQuizId(userId, quizId);
        Integer maxAttempts = quiz.getMaxAttempts();
        if (maxAttempts != null && previousAttempts >= maxAttempts) {
            throw ApiException.forbidden("Maximum attempts reached for this quiz");
        }

        List<QuizQuestion> questions = questionRepository.findByQuizIdOrderByOrderIndexAsc(quizId);
        Map<Long, QuizQuestion> byId = new LinkedHashMap<>();
        for (QuizQuestion q : questions) byId.put(q.getId(), q);

        int correctCount = 0;
        List<Map<String, Object>> graded = new ArrayList<>();
        Map<String, Object> answerMap = new LinkedHashMap<>();

        for (Map<String, Object> a : answers) {
            Long questionId = parseLong(a.get("questionId"));
            Object userAnswer = a.get("answer");
            if (questionId == null) continue;
            answerMap.put(String.valueOf(questionId), userAnswer);
            QuizQuestion q = byId.get(questionId);
            if (q == null) continue;

            boolean correct = grade(q, userAnswer);
            if (correct) correctCount++;
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("questionId", String.valueOf(questionId));
            g.put("isCorrect", correct);
            graded.add(g);
        }

        int totalQuestions = questions.size();
        int score = totalQuestions > 0 ? (int) Math.round((correctCount * 100.0) / totalQuestions) : 0;
        boolean isPassed = score >= quiz.getPassingScore();
        int attemptNumber = (int) previousAttempts + 1;

        QuizAttempt attempt = new QuizAttempt();
        attempt.setUserId(userId);
        attempt.setQuizId(quizId);
        attempt.setScore(score);
        attempt.setTotalQuestions(totalQuestions);
        attempt.setCorrectAnswers(correctCount);
        attempt.setPassed(isPassed);
        attempt.setAttemptNumber(attemptNumber);
        attempt.setTimeTakenMinutes(timeTakenMinutes);
        attempt.setAnswers(writeJson(answerMap));
        attempt.setCompletedAt(Instant.now());
        attemptRepository.save(attempt);

        // Recompute progress now that this quiz may be passed.
        progressService.recomputeModuleCompletion(userId, quiz.getCourseId(), quiz.getSectionId());
        progressService.recomputeCourseProgress(userId, quiz.getCourseId());

        if (isPassed) {
            pushNotificationService.notifyLearningEvent(userId, "Quiz passed",
                    "You scored " + score + "% on \"" + quiz.getTitle() + "\". Well done!");
            achievementService.evaluate(userId, quiz.getCourseId());
        }
        goalService.onLearningActivity(userId, timeTakenMinutes == null ? 1 : timeTakenMinutes);

        Integer remaining = maxAttempts == null ? null : Math.max(0, maxAttempts - attemptNumber);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("score", score);
        data.put("totalQuestions", totalQuestions);
        data.put("correctAnswers", correctCount);
        data.put("isPassed", isPassed);
        data.put("attemptNumber", attemptNumber);
        data.put("attemptsRemaining", remaining);
        data.put("answers", graded);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("message", "Quiz submitted successfully");
        response.put("data", data);
        return response;
    }

    public Map<String, Object> getQuizResults(Long quizId, Long userId) {
        List<QuizAttempt> attempts = attemptRepository.findByUserIdAndQuizIdOrderByAttemptNumberDesc(userId, quizId);
        if (attempts.isEmpty()) {
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("success", true);
            response.put("data", null);
            return response;
        }
        QuizAttempt latest = attempts.get(0);
        List<QuizQuestion> questions = questionRepository.findByQuizIdOrderByOrderIndexAsc(quizId);
        Map<String, Object> submitted = parseJsonMap(latest.getAnswers());

        List<Map<String, Object>> review = new ArrayList<>();
        for (QuizQuestion q : questions) {
            Object userAnswer = submitted.get(String.valueOf(q.getId()));
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", String.valueOf(q.getId()));
            m.put("question", q.getQuestion());
            m.put("question_type", q.getQuestionType());
            m.put("your_answer", userAnswer);
            m.put("correct_answer", parseJsonOrRaw(q.getCorrectAnswer()));
            m.put("is_correct", grade(q, userAnswer));
            m.put("explanation", q.getExplanation());
            review.add(m);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("score", latest.getScore());
        data.put("isPassed", latest.isPassed());
        data.put("attemptNumber", latest.getAttemptNumber());
        data.put("totalQuestions", latest.getTotalQuestions());
        data.put("correctAnswers", latest.getCorrectAnswers());
        data.put("gradesReleased", latest.isGradesReleased());
        data.put("questions", review);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("data", data);
        return response;
    }

    /**
     * Adds {@code matching_left} (ordered prompts) and {@code matching_right}
     * (shuffled choices) to a matching question payload, derived from the stored
     * correct pairs. The correct left→right mapping is never sent to the client.
     */
    private void addMatchingDisplay(Map<String, Object> m, QuizQuestion q) {
        List<Map<String, Object>> pairs = toMapList(parseJsonOrRaw(q.getCorrectAnswer()));
        List<String> left = new ArrayList<>();
        List<String> right = new ArrayList<>();
        for (Map<String, Object> p : pairs) {
            left.add(String.valueOf(p.get("left")));
            right.add(String.valueOf(p.get("right")));
        }
        Collections.shuffle(right);
        m.put("matching_left", left);
        m.put("matching_right", right);
    }

    // ---- grading --------------------------------------------------------

    private boolean grade(QuizQuestion q, Object userAnswer) {
        if (userAnswer == null) return false;
        String type = q.getQuestionType() == null ? "" : q.getQuestionType();
        Object correct = parseJsonOrRaw(q.getCorrectAnswer());

        switch (type) {
            case "multiple-correct": {
                List<String> ua = toStringList(userAnswer);
                List<String> ca = toStringList(correct);
                Collections.sort(ua);
                Collections.sort(ca);
                return !ca.isEmpty() && ua.equals(ca);
            }
            case "matching": {
                List<Map<String, Object>> ua = toMapList(userAnswer);
                List<Map<String, Object>> ca = toMapList(correct);
                if (ua.isEmpty() || ua.size() != ca.size()) return false;
                for (Map<String, Object> up : ua) {
                    boolean found = ca.stream().anyMatch(cp ->
                            Objects.equals(String.valueOf(cp.get("left")), String.valueOf(up.get("left")))
                                    && Objects.equals(String.valueOf(cp.get("right")), String.valueOf(up.get("right"))));
                    if (!found) return false;
                }
                return true;
            }
            case "short-answer":
            case "text":
                return normalize(String.valueOf(userAnswer)).equals(normalize(String.valueOf(correct)));
            default: // multiple-choice, true-false
                return Objects.equals(String.valueOf(userAnswer), String.valueOf(correct));
        }
    }

    private String normalize(String s) {
        return s == null ? "" : s.trim().toLowerCase().replaceAll("\\s+", " ");
    }

    @SuppressWarnings("unchecked")
    private List<String> toStringList(Object v) {
        List<String> out = new ArrayList<>();
        if (v instanceof List<?> list) {
            for (Object o : list) out.add(String.valueOf(o));
        } else if (v != null) {
            out.add(String.valueOf(v));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> toMapList(Object v) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (v instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m) out.add((Map<String, Object>) m);
            }
        }
        return out;
    }

    // ---- json helpers ---------------------------------------------------

    private Object parseJsonOrNull(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, Object.class);
        } catch (Exception e) {
            return null;
        }
    }

    private Object parseJsonOrRaw(String json) {
        if (json == null) return null;
        String trimmed = json.trim();
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
            try {
                return objectMapper.readValue(trimmed, Object.class);
            } catch (Exception ignored) {
            }
        }
        return json;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseJsonMap(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return "{}";
        }
    }

    private Long parseLong(Object v) {
        if (v == null) return null;
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
