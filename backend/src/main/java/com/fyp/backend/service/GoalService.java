package com.fyp.backend.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.GoalTemplate;
import com.fyp.backend.model.LearningGoal;
import com.fyp.backend.model.UserAnalytics;
import com.fyp.backend.model.UserPreferences;
import com.fyp.backend.repository.CourseEnrollmentRepository;
import com.fyp.backend.repository.GoalTemplateRepository;
import com.fyp.backend.repository.LearningGoalRepository;
import com.fyp.backend.repository.QuizAttemptRepository;
import com.fyp.backend.repository.UserAnalyticsRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Learning goals, templates, daily-activity analytics and streaks. Goal progress
 * is recomputed from the user's activity; completing a goal awards its reward
 * points (display/goal score only — no shop).
 */
@Service
public class GoalService {

    @Autowired private LearningGoalRepository goalRepository;
    @Autowired private GoalTemplateRepository templateRepository;
    @Autowired private UserAnalyticsRepository analyticsRepository;
    @Autowired private CourseEnrollmentRepository enrollmentRepository;
    @Autowired private QuizAttemptRepository attemptRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private PreferencesService preferencesService;
    @Autowired private PushNotificationService pushNotificationService;

    /** Single entry point after any learning activity: analytics + streak + goals. */
    @Transactional
    public void onLearningActivity(Long userId, int minutes) {
        if (userId == null) return;
        recordDailyActivity(userId, Math.max(0, minutes));
        preferencesService.recordStreakActivity(userId);
        updateGoalProgress(userId);
    }

    @Transactional
    public void recordDailyActivity(Long userId, int minutes) {
        String today = preferencesService.todayInUserZone(userId);
        UserAnalytics a = analyticsRepository.findByUserIdAndActivityDate(userId, today)
                .orElseGet(() -> {
                    UserAnalytics na = new UserAnalytics();
                    na.setUserId(userId);
                    na.setActivityDate(today);
                    return na;
                });
        a.setMinutesSpent((a.getMinutesSpent() == null ? 0 : a.getMinutesSpent()) + minutes);
        a.setActivitiesCount((a.getActivitiesCount() == null ? 0 : a.getActivitiesCount()) + 1);
        analyticsRepository.save(a);
    }

    public Map<String, Object> updateStreakAndGet(Long userId) {
        UserPreferences p = preferencesService.recordStreakActivity(userId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("current_streak", p.getCurrentStreak());
        m.put("longest_streak", p.getLongestStreak());
        m.put("last_activity_date", p.getLastActivityDate());
        return m;
    }

    @Transactional
    public void updateGoalProgress(Long userId) {
        long coursesCompleted = -1, quizzesPassed = -1, minutesSpent = -1;
        for (LearningGoal g : goalRepository.findByUserIdOrderByCreatedAtDesc(userId)) {
            if (!g.isActive() || g.isCompleted()) continue;
            long value;
            switch (g.getMetric()) {
                case "courses_completed":
                    if (coursesCompleted < 0) coursesCompleted = enrollmentRepository.countByUserIdAndIsCompletedTrue(userId);
                    value = coursesCompleted;
                    break;
                case "quizzes_passed":
                    if (quizzesPassed < 0) quizzesPassed = attemptRepository.countDistinctPassedQuizzes(userId);
                    value = quizzesPassed;
                    break;
                case "minutes_spent":
                    if (minutesSpent < 0) minutesSpent = analyticsRepository.sumMinutesByUserId(userId);
                    value = minutesSpent;
                    break;
                default:
                    continue;
            }
            g.setCurrentValue((int) Math.min(value, Integer.MAX_VALUE));
            int target = g.getTargetValue() == null ? 0 : g.getTargetValue();
            if (target > 0 && value >= target) {
                g.setCompleted(true);
                g.setCompletedAt(Instant.now());
                awardGoalReward(userId, g);
            }
            goalRepository.save(g);
        }
    }

    private void awardGoalReward(Long userId, LearningGoal g) {
        int reward = g.getRewardPoints() == null ? 0 : g.getRewardPoints();
        if (reward > 0) {
            userRepository.findById(userId).ifPresent(u -> {
                u.setPoints((u.getPoints() == null ? 0 : u.getPoints()) + reward);
                userRepository.save(u);
            });
        }
        pushNotificationService.notifyLearningEvent(userId, "Goal reached",
                "You completed your goal: \"" + g.getLabel() + "\".");
    }

    // ---- queries / mutations -------------------------------------------

    public Map<String, Object> getGoals(Long userId) {
        updateGoalProgress(userId);
        List<Map<String, Object>> goals = new ArrayList<>();
        for (LearningGoal g : goalRepository.findByUserIdOrderByCreatedAtDesc(userId)) {
            goals.add(goalMap(g));
        }
        UserPreferences p = preferencesService.getOrCreate(userId);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("goals", goals);
        data.put("current_streak", p.getCurrentStreak());
        data.put("longest_streak", p.getLongestStreak());
        return data;
    }

    public List<Map<String, Object>> getGoalTemplates() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (GoalTemplate t : templateRepository.findByIsActiveTrue()) {
            out.add(templateMap(t));
        }
        return out;
    }

    @Transactional
    public List<Map<String, Object>> createGoalsFromTemplates(Long userId, List<Long> templateIds) {
        List<Map<String, Object>> created = new ArrayList<>();
        for (Long templateId : templateIds) {
            if (templateId == null || goalRepository.existsByUserIdAndTemplateId(userId, templateId)) continue;
            GoalTemplate t = templateRepository.findById(templateId).orElse(null);
            if (t == null) continue;
            LearningGoal g = new LearningGoal();
            g.setUserId(userId);
            g.setLabel(t.getLabel());
            g.setMetric(t.getMetric());
            g.setTargetValue(t.getTargetValue());
            g.setRewardPoints(t.getRewardPoints());
            g.setTemplateId(t.getId());
            created.add(goalMap(goalRepository.save(g)));
        }
        updateGoalProgress(userId);
        return created;
    }

    @Transactional
    public void setGoalActive(Long userId, Long goalId, boolean active) {
        LearningGoal g = ownedGoal(userId, goalId);
        g.setActive(active);
        goalRepository.save(g);
    }

    @Transactional
    public void clearGoal(Long userId, Long goalId) {
        LearningGoal g = ownedGoal(userId, goalId);
        goalRepository.delete(g);
    }

    private LearningGoal ownedGoal(Long userId, Long goalId) {
        LearningGoal g = goalRepository.findById(goalId)
                .orElseThrow(() -> ApiException.notFound("Goal not found"));
        if (!g.getUserId().equals(userId)) throw ApiException.forbidden("Not your goal");
        return g;
    }

    private Map<String, Object> goalMap(LearningGoal g) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(g.getId()));
        m.put("label", g.getLabel());
        m.put("metric", g.getMetric());
        m.put("target_value", g.getTargetValue());
        m.put("current_value", g.getCurrentValue());
        m.put("reward_points", g.getRewardPoints());
        m.put("is_active", g.isActive());
        m.put("is_completed", g.isCompleted());
        m.put("deadline", g.getDeadline());
        return m;
    }

    private Map<String, Object> templateMap(GoalTemplate t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", String.valueOf(t.getId()));
        m.put("label", t.getLabel());
        m.put("difficulty", t.getDifficulty());
        m.put("metric", t.getMetric());
        m.put("target_value", t.getTargetValue());
        m.put("reward_points", t.getRewardPoints());
        return m;
    }
}
