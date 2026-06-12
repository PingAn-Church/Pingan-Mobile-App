package com.fyp.backend.controller.learning;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.service.GoalService;
import com.fyp.backend.service.UserService;

/** Learning goals, templates, streaks and daily-activity recording. */
@RestController
@RequestMapping("/api/fn")
public class GoalController {

    @Autowired private GoalService goalService;
    @Autowired private UserService userService;

    private Long currentUserId(String auth) {
        Long userId = userService.getUserIdFromToken(auth);
        if (userId == null) throw ApiException.unauthorized("Not authenticated");
        return userId;
    }

    @GetMapping("/getGoals")
    public ApiResponse<Map<String, Object>> getGoals(@RequestHeader("Authorization") String auth) {
        return ApiResponse.ok(goalService.getGoals(currentUserId(auth)));
    }

    @GetMapping("/getGoalTemplates")
    public ApiResponse<List<Map<String, Object>>> getGoalTemplates(@RequestHeader("Authorization") String auth) {
        return ApiResponse.ok(goalService.getGoalTemplates());
    }

    @PostMapping("/createGoalsFromTemplates")
    public ApiResponse<List<Map<String, Object>>> createGoalsFromTemplates(
            @RequestHeader("Authorization") String auth, @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Goals created",
                goalService.createGoalsFromTemplates(currentUserId(auth), parseIds(body.get("templateIds"))));
    }

    @PostMapping("/setGoalActive")
    public ApiResponse<Object> setGoalActive(@RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        Long goalId = parseLong(body.get("goalId"));
        if (goalId == null) throw ApiException.badRequest("goalId is required");
        boolean active = !body.containsKey("isActive") || Boolean.parseBoolean(String.valueOf(body.get("isActive")));
        goalService.setGoalActive(currentUserId(auth), goalId, active);
        return ApiResponse.ok("Goal updated", null);
    }

    @PostMapping("/clearGoal")
    public ApiResponse<Object> clearGoal(@RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        Long goalId = parseLong(body.get("goalId"));
        if (goalId == null) throw ApiException.badRequest("goalId is required");
        goalService.clearGoal(currentUserId(auth), goalId);
        return ApiResponse.ok("Goal cleared", null);
    }

    @PostMapping("/updateStreak")
    public ApiResponse<Map<String, Object>> updateStreak(@RequestHeader("Authorization") String auth) {
        return ApiResponse.ok(goalService.updateStreakAndGet(currentUserId(auth)));
    }

    @PostMapping("/recordDailyActivity")
    public ApiResponse<Object> recordDailyActivity(@RequestHeader("Authorization") String auth,
            @RequestBody(required = false) Map<String, Object> body) {
        int minutes = body == null ? 0 : parseInt(body.get("minutes"));
        goalService.onLearningActivity(currentUserId(auth), minutes);
        return ApiResponse.ok("Activity recorded", null);
    }

    private List<Long> parseIds(Object raw) {
        List<Long> ids = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object o : list) {
                Long id = parseLong(o);
                if (id != null) ids.add(id);
            }
        }
        return ids;
    }

    private Long parseLong(Object v) {
        if (v == null) return null;
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private int parseInt(Object v) {
        if (v == null) return 0;
        try {
            return (int) Double.parseDouble(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
