package com.fyp.backend.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.CourseQuiz;
import com.fyp.backend.model.QuizAttempt;
import com.fyp.backend.model.QuizQuestion;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CourseQuizRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.QuizAttemptRepository;
import com.fyp.backend.repository.QuizQuestionRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Quiz delivery + grading engine (P5/P6). Auto-grades multiple-choice,
 * multiple-correct, true-false and matching questions; short-answer questions
 * are held for manual instructor review (grades stay unreleased and the
 * attempt is not passable until every short answer is graded).
 */
@Service
public class QuizService {

    /** Question types graded manually by the instructor ("text" is the legacy alias). */
    private static final List<String> MANUAL_TYPES = List.of("short-answer", "text");

    @Autowired private CourseQuizRepository quizRepository;
    @Autowired private QuizQuestionRepository questionRepository;
    @Autowired private QuizAttemptRepository attemptRepository;
    @Autowired private CourseRepository courseRepository;
    @Autowired private UserRepository userRepository;
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

        int pendingCount = 0;
        double autoPointsPossible = 0;
        double totalPointsPossible = 0;
        for (QuizQuestion q : questions) {
            totalPointsPossible += points(q);
            if (isManuallyGraded(q)) pendingCount++;
            else autoPointsPossible += points(q);
        }
        boolean hasShortAnswer = pendingCount > 0;

        int correctCount = 0;
        double pointsEarned = 0;
        List<Map<String, Object>> graded = new ArrayList<>();
        Map<String, Object> answerMap = new LinkedHashMap<>();

        for (Map<String, Object> a : answers) {
            Long questionId = parseLong(a.get("questionId"));
            Object userAnswer = a.get("answer");
            if (questionId == null) continue;
            answerMap.put(String.valueOf(questionId), userAnswer);
            QuizQuestion q = byId.get(questionId);
            if (q == null) continue;

            Map<String, Object> g = new LinkedHashMap<>();
            g.put("questionId", String.valueOf(questionId));
            if (isManuallyGraded(q)) {
                // Held for instructor review; verdict unknown until graded.
                g.put("isCorrect", null);
                g.put("requiresManualGrading", true);
            } else {
                boolean correct = grade(q, userAnswer);
                if (correct) {
                    correctCount++;
                    pointsEarned += points(q);
                }
                g.put("isCorrect", correct);
            }
            graded.add(g);
        }

        int totalQuestions = questions.size();
        // Points-weighted score. With short answers present it is provisional
        // (auto-gradable portion only) and the attempt can't pass until the
        // instructor grades the rest.
        int score;
        boolean isPassed;
        if (hasShortAnswer) {
            score = autoPointsPossible > 0 ? (int) Math.round(pointsEarned * 100.0 / autoPointsPossible) : 0;
            isPassed = false;
        } else {
            score = totalPointsPossible > 0 ? (int) Math.round(pointsEarned * 100.0 / totalPointsPossible) : 0;
            isPassed = score >= quiz.getPassingScore();
        }
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
        attempt.setGradesReleased(!hasShortAnswer);
        attempt.setCompletedAt(Instant.now());
        attemptRepository.save(attempt);

        // Recompute progress now that this quiz may be passed (or, for
        // short-answer quizzes, attempted — which counts toward progress).
        progressService.recomputeModuleCompletion(userId, quiz.getCourseId(), quiz.getSectionId());
        progressService.recomputeCourseProgress(userId, quiz.getCourseId());

        if (isPassed) {
            pushNotificationService.notifyLearningEvent(userId, "Quiz passed",
                    "You scored " + score + "% on \"" + quiz.getTitle() + "\". Well done!");
            achievementService.evaluate(userId, quiz.getCourseId());
        }
        if (hasShortAnswer) {
            notifyInstructorOfPendingReview(quiz);
        }
        goalService.onLearningActivity(userId, timeTakenMinutes == null ? 1 : timeTakenMinutes);

        Integer remaining = maxAttempts == null ? null : Math.max(0, maxAttempts - attemptNumber);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("score", score);
        data.put("totalQuestions", totalQuestions);
        data.put("correctAnswers", correctCount);
        data.put("isPassed", isPassed);
        data.put("pendingReview", hasShortAnswer);
        data.put("pendingCount", pendingCount);
        data.put("gradesReleased", !hasShortAnswer);
        data.put("attemptNumber", attemptNumber);
        data.put("attemptsRemaining", remaining);
        data.put("answers", graded);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("message", "Quiz submitted successfully");
        response.put("data", data);
        return response;
    }

    private void notifyInstructorOfPendingReview(CourseQuiz quiz) {
        Course course = courseRepository.findById(quiz.getCourseId()).orElse(null);
        if (course == null || course.getInstructorId() == null) return;
        pushNotificationService.notifyLearningEvent(course.getInstructorId(), "Answers to review",
                "A learner submitted \"" + quiz.getTitle() + "\" — short answers are awaiting your review.");
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
        Map<String, Object> manualGrades = parseJsonMap(latest.getGradedAnswers());

        List<Map<String, Object>> review = new ArrayList<>();
        for (QuizQuestion q : questions) {
            Object userAnswer = submitted.get(String.valueOf(q.getId()));
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", String.valueOf(q.getId()));
            m.put("question", q.getQuestion());
            m.put("question_type", q.getQuestionType());
            m.put("your_answer", userAnswer);
            if (isManuallyGraded(q)) {
                Object g = manualGrades.get(String.valueOf(q.getId()));
                if (g instanceof Map<?, ?> gm) {
                    double awarded = toDouble(gm.get("pointsAwarded"));
                    m.put("is_correct", awarded >= points(q));
                    m.put("points_awarded", awarded);
                    m.put("max_points", points(q));
                    m.put("feedback", gm.get("feedback"));
                    m.put("correct_answer", parseJsonOrRaw(q.getCorrectAnswer()));
                } else {
                    // Not reviewed yet: no verdict, and don't reveal the
                    // expected answer before the instructor releases grades.
                    m.put("is_correct", null);
                    m.put("pending_review", true);
                    m.put("correct_answer", null);
                }
            } else {
                m.put("correct_answer", parseJsonOrRaw(q.getCorrectAnswer()));
                m.put("is_correct", grade(q, userAnswer));
            }
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

    // ---- manual grading (P6) ---------------------------------------------

    /**
     * Attempts awaiting short-answer review, scoped to courses the requester
     * owns (admins see every course). One entry per attempt with its ungraded
     * short-answer questions, oldest submission first.
     */
    public List<Map<String, Object>> pendingGrading(User requester) {
        List<Course> courses = requester.isAdmin()
                ? courseRepository.findAll()
                : courseRepository.findByInstructorId(requester.getId());

        List<Map<String, Object>> out = new ArrayList<>();
        for (Course course : courses) {
            for (CourseQuiz quiz : quizRepository.findByCourseIdOrderByOrderIndexAsc(course.getId())) {
                List<QuizQuestion> manualQuestions = questionRepository
                        .findByQuizIdOrderByOrderIndexAsc(quiz.getId())
                        .stream().filter(this::isManuallyGraded).toList();
                if (manualQuestions.isEmpty()) continue;

                for (QuizAttempt attempt : attemptRepository
                        .findByQuizIdInAndGradesReleasedFalse(List.of(quiz.getId()))) {
                    Map<String, Object> submitted = parseJsonMap(attempt.getAnswers());
                    Map<String, Object> manualGrades = parseJsonMap(attempt.getGradedAnswers());

                    List<Map<String, Object>> pendingQuestions = new ArrayList<>();
                    for (QuizQuestion q : manualQuestions) {
                        if (manualGrades.containsKey(String.valueOf(q.getId()))) continue;
                        Map<String, Object> qm = new LinkedHashMap<>();
                        qm.put("question_id", String.valueOf(q.getId()));
                        qm.put("question", q.getQuestion());
                        qm.put("points", points(q));
                        qm.put("expected_answer", parseJsonOrRaw(q.getCorrectAnswer()));
                        qm.put("student_answer", submitted.get(String.valueOf(q.getId())));
                        pendingQuestions.add(qm);
                    }
                    if (pendingQuestions.isEmpty()) continue;

                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("attempt_id", String.valueOf(attempt.getId()));
                    m.put("quiz_id", String.valueOf(quiz.getId()));
                    m.put("quiz_title", quiz.getTitle());
                    m.put("course_id", String.valueOf(course.getId()));
                    m.put("course_title", course.getTitle());
                    m.put("student_name", studentName(attempt.getUserId()));
                    m.put("attempt_number", attempt.getAttemptNumber());
                    m.put("submitted_at", attempt.getCompletedAt() == null ? null : attempt.getCompletedAt().toString());
                    m.put("questions", pendingQuestions);
                    out.add(m);
                }
            }
        }
        out.sort(Comparator.comparing(m -> String.valueOf(m.get("submitted_at"))));
        return out;
    }

    /**
     * Records the instructor's grade for one short answer, rescores the attempt
     * points-weighted, and releases grades once every short answer is reviewed.
     */
    @Transactional
    public Map<String, Object> gradeShortAnswer(User grader, Map<String, Object> body) {
        Long attemptId = parseLong(body.get("attemptId"));
        Long questionId = parseLong(body.get("questionId"));
        Object rawPoints = body.get("pointsAwarded");
        if (attemptId == null || questionId == null || rawPoints == null) {
            throw ApiException.badRequest("attemptId, questionId and pointsAwarded are required");
        }

        QuizAttempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() -> ApiException.notFound("Quiz attempt not found"));
        QuizQuestion question = questionRepository.findById(questionId)
                .orElseThrow(() -> ApiException.notFound("Question not found"));
        if (!question.getQuizId().equals(attempt.getQuizId())) {
            throw ApiException.badRequest("Question does not belong to this attempt's quiz");
        }
        if (!isManuallyGraded(question)) {
            throw ApiException.badRequest("Only short-answer questions are graded manually");
        }
        CourseQuiz quiz = quizRepository.findById(attempt.getQuizId())
                .orElseThrow(() -> ApiException.notFound("Quiz not found"));
        if (!grader.isAdmin()) {
            Long ownerId = courseRepository.findById(quiz.getCourseId())
                    .map(Course::getInstructorId).orElse(null);
            if (ownerId == null || !ownerId.equals(grader.getId())) {
                throw ApiException.forbidden("You can only grade quizzes in your own courses");
            }
        }

        int maxPoints = points(question);
        double awarded = toDouble(rawPoints);
        if (awarded < 0 || awarded > maxPoints) {
            throw ApiException.badRequest("pointsAwarded must be between 0 and " + maxPoints);
        }

        Map<String, Object> manualGrades = parseJsonMap(attempt.getGradedAnswers());
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("pointsAwarded", awarded);
        entry.put("maxPoints", maxPoints);
        entry.put("feedback", body.get("feedback"));
        entry.put("gradedAt", Instant.now().toString());
        entry.put("gradedBy", String.valueOf(grader.getId()));
        manualGrades.put(String.valueOf(questionId), entry);
        attempt.setGradedAnswers(writeJson(manualGrades));

        // Points-weighted rescore across all questions.
        List<QuizQuestion> questions = questionRepository.findByQuizIdOrderByOrderIndexAsc(attempt.getQuizId());
        Map<String, Object> submitted = parseJsonMap(attempt.getAnswers());
        double earned = 0;
        double possible = 0;
        int correctCount = 0;
        int ungraded = 0;
        for (QuizQuestion q : questions) {
            int p = points(q);
            possible += p;
            if (isManuallyGraded(q)) {
                Object g = manualGrades.get(String.valueOf(q.getId()));
                if (g instanceof Map<?, ?> gm) {
                    double pa = toDouble(gm.get("pointsAwarded"));
                    earned += pa;
                    if (pa >= p) correctCount++;
                } else {
                    ungraded++;
                }
            } else if (grade(q, submitted.get(String.valueOf(q.getId())))) {
                earned += p;
                correctCount++;
            }
        }
        int score = possible > 0 ? (int) Math.round(earned * 100.0 / possible) : 0;
        boolean fullyGraded = ungraded == 0;
        boolean wasPassed = attempt.isPassed();
        boolean isPassed = fullyGraded && score >= quiz.getPassingScore();

        attempt.setScore(score);
        attempt.setCorrectAnswers(correctCount);
        attempt.setPassed(isPassed);
        attempt.setGradesReleased(fullyGraded);
        attemptRepository.save(attempt);

        if (fullyGraded) {
            progressService.recomputeModuleCompletion(attempt.getUserId(), quiz.getCourseId(), quiz.getSectionId());
            progressService.recomputeCourseProgress(attempt.getUserId(), quiz.getCourseId());
            pushNotificationService.notifyLearningEvent(attempt.getUserId(), "Quiz graded",
                    "Your answers for \"" + quiz.getTitle() + "\" were reviewed. Score: " + score + "%"
                            + (isPassed ? " — passed!" : "."));
            if (isPassed && !wasPassed) {
                achievementService.evaluate(attempt.getUserId(), quiz.getCourseId());
            }
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("attemptId", String.valueOf(attempt.getId()));
        data.put("questionId", String.valueOf(questionId));
        data.put("pointsAwarded", awarded);
        data.put("maxPoints", maxPoints);
        data.put("score", score);
        data.put("isPassed", isPassed);
        data.put("gradesReleased", fullyGraded);
        data.put("remainingUngraded", ungraded);
        return data;
    }

    private boolean isManuallyGraded(QuizQuestion q) {
        return q.getQuestionType() != null && MANUAL_TYPES.contains(q.getQuestionType());
    }

    private int points(QuizQuestion q) {
        return q.getPoints() == null || q.getPoints() <= 0 ? 1 : q.getPoints();
    }

    private double toDouble(Object v) {
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (Exception e) {
            return 0;
        }
    }

    private String studentName(Long userId) {
        return userRepository.findById(userId).map(u -> {
            String name = ((u.getFirstName() == null ? "" : u.getFirstName()) + " "
                    + (u.getLastName() == null ? "" : u.getLastName())).trim();
            return name.isEmpty() ? (u.getEmail() == null ? "Learner" : u.getEmail()) : name;
        }).orElse("Learner");
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
