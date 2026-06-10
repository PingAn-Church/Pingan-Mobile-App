package com.fyp.backend.service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.Achievement;
import com.fyp.backend.model.User;
import com.fyp.backend.model.UserAchievement;
import com.fyp.backend.repository.AchievementRepository;
import com.fyp.backend.repository.CourseEnrollmentRepository;
import com.fyp.backend.repository.QuizAttemptRepository;
import com.fyp.backend.repository.UserAchievementRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Badge catalogue, earning engine and admin authoring. Achievements are
 * evaluated after learning events; earning one awards its points to the user
 * (points are a display/goal-tracking score — there is no shop/redemption).
 */
@Service
public class AchievementService {

    @Autowired private AchievementRepository achievementRepository;
    @Autowired private UserAchievementRepository userAchievementRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CourseEnrollmentRepository enrollmentRepository;
    @Autowired private QuizAttemptRepository attemptRepository;
    @Autowired private PushNotificationService pushNotificationService;
    @Autowired private ObjectMapper objectMapper;

    /**
     * Evaluates every active, not-yet-earned achievement for the user and awards
     * any whose criteria are now satisfied. Safe to call after any learning event.
     */
    @Transactional
    public void evaluate(Long userId, Long sourceCourseId) {
        if (userId == null) return;
        Set<Long> earned = userAchievementRepository.findByUserId(userId).stream()
                .map(UserAchievement::getAchievementId).collect(Collectors.toCollection(HashSet::new));

        long coursesCompleted = -1, quizzesPassed = -1; // lazily computed
        for (Achievement a : achievementRepository.findByIsActiveTrue()) {
            if (earned.contains(a.getId())) continue;
            Map<String, Object> criteria = readJson(a.getCriteria());
            String metric = String.valueOf(criteria.getOrDefault("metric", ""));
            int threshold = toInt(criteria.get("threshold"), 1);

            long value;
            switch (metric) {
                case "courses_completed":
                    if (coursesCompleted < 0) coursesCompleted = enrollmentRepository.countByUserIdAndIsCompletedTrue(userId);
                    value = coursesCompleted;
                    break;
                case "quizzes_passed":
                    if (quizzesPassed < 0) quizzesPassed = attemptRepository.countDistinctPassedQuizzes(userId);
                    value = quizzesPassed;
                    break;
                default:
                    continue; // unknown metric — skip
            }
            if (value >= threshold) award(userId, a, sourceCourseId);
        }
    }

    private void award(Long userId, Achievement a, Long sourceCourseId) {
        if (userAchievementRepository.existsByUserIdAndAchievementId(userId, a.getId())) return;
        UserAchievement ua = new UserAchievement();
        ua.setUserId(userId);
        ua.setAchievementId(a.getId());
        ua.setSourceCourseId(sourceCourseId);
        userAchievementRepository.save(ua);

        int points = a.getPoints() == null ? 0 : a.getPoints();
        if (points > 0) {
            userRepository.findById(userId).ifPresent(u -> {
                u.setPoints((u.getPoints() == null ? 0 : u.getPoints()) + points);
                userRepository.save(u);
            });
        }
        pushNotificationService.notifyLearningEvent(userId, "Achievement unlocked",
                "You earned the \"" + a.getName() + "\" badge!");
    }

    public List<Map<String, Object>> getAchievements(Long userId) {
        Map<Long, UserAchievement> earned = new LinkedHashMap<>();
        for (UserAchievement ua : userAchievementRepository.findByUserId(userId)) {
            earned.put(ua.getAchievementId(), ua);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Achievement a : achievementRepository.findByIsActiveTrue()) {
            Map<String, Object> m = toMap(a);
            UserAchievement ua = earned.get(a.getId());
            m.put("earned", ua != null);
            m.put("earned_at", ua == null ? null : ua.getEarnedAt());
            out.add(m);
        }
        return out;
    }

    // ---- admin authoring ------------------------------------------------

    public Map<String, Object> createAchievement(Map<String, Object> body) {
        Achievement a = new Achievement();
        applyBody(a, body, true);
        return toMap(achievementRepository.save(a));
    }

    public Map<String, Object> updateAchievement(Long id, Map<String, Object> body) {
        Achievement a = achievementRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("Achievement not found"));
        applyBody(a, body, false);
        return toMap(achievementRepository.save(a));
    }

    public void deleteAchievement(Long id) {
        if (!achievementRepository.existsById(id)) throw ApiException.notFound("Achievement not found");
        achievementRepository.deleteById(id);
    }

    private void applyBody(Achievement a, Map<String, Object> body, boolean create) {
        if (create || body.containsKey("name")) {
            Object name = body.get("name");
            if (name == null || String.valueOf(name).isBlank()) throw ApiException.badRequest("name is required");
            a.setName(String.valueOf(name).trim());
        }
        if (body.containsKey("description")) a.setDescription(str(body.get("description")));
        if (body.containsKey("icon")) a.setIcon(str(body.get("icon")));
        if (body.containsKey("type")) a.setType(str(body.get("type")));
        if (body.containsKey("criteria")) a.setCriteria(toJsonOrString(body.get("criteria")));
        if (body.containsKey("points")) a.setPoints(toInt(body.get("points"), 0));
        if (body.containsKey("isActive")) a.setActive(toBool(body.get("isActive"), true));
    }

    private Map<String, Object> toMap(Achievement a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(a.getId()));
        m.put("name", a.getName());
        m.put("description", a.getDescription());
        m.put("icon", a.getIcon());
        m.put("type", a.getType());
        m.put("points", a.getPoints());
        return m;
    }

    // ---- helpers --------------------------------------------------------

    @SuppressWarnings("unchecked")
    private Map<String, Object> readJson(String json) {
        if (json == null || json.isBlank()) return new LinkedHashMap<>();
        try {
            return objectMapper.readValue(json, Map.class);
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
    }

    private String toJsonOrString(Object value) {
        if (value == null) return null;
        if (value instanceof String s) return s;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }

    private String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private int toInt(Object v, int def) {
        if (v == null) return def;
        try {
            return (int) Double.parseDouble(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private boolean toBool(Object v, boolean def) {
        if (v == null) return def;
        if (v instanceof Boolean b) return b;
        return Boolean.parseBoolean(String.valueOf(v).trim());
    }
}
