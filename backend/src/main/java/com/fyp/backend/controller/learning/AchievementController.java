package com.fyp.backend.controller.learning;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.service.AchievementService;
import com.fyp.backend.service.UserService;

/**
 * Achievement catalogue (with the caller's earned status) and admin authoring.
 */
@RestController
@RequestMapping("/api/fn")
public class AchievementController {

    @Autowired private AchievementService achievementService;
    @Autowired private UserService userService;

    private Long currentUserId(String auth) {
        Long userId = userService.getUserIdFromToken(auth);
        if (userId == null) throw ApiException.unauthorized("Not authenticated");
        return userId;
    }

    @GetMapping("/getAchievements")
    public ApiResponse<List<Map<String, Object>>> getAchievements(@RequestHeader("Authorization") String auth) {
        return ApiResponse.ok(achievementService.getAchievements(currentUserId(auth)));
    }

    @GetMapping("/listAchievements")
    public ApiResponse<List<Map<String, Object>>> listAchievements(@RequestHeader("Authorization") String auth) {
        return ApiResponse.ok(achievementService.getAchievements(currentUserId(auth)));
    }

    @PostMapping("/createAchievement")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Map<String, Object>> createAchievement(@RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Achievement created", achievementService.createAchievement(body));
    }

    @PutMapping("/updateAchievement/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Map<String, Object>> updateAchievement(@PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Achievement updated", achievementService.updateAchievement(id, body));
    }

    @DeleteMapping("/deleteAchievement/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResponse<Object> deleteAchievement(@PathVariable Long id) {
        achievementService.deleteAchievement(id);
        return ApiResponse.ok("Achievement deleted", null);
    }
}
