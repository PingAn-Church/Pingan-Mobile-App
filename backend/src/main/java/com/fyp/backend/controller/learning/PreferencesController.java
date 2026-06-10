package com.fyp.backend.controller.learning;

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
import com.fyp.backend.service.PreferencesService;
import com.fyp.backend.service.UserService;

/** Per-user learning preferences (timezone, notifications, theme). */
@RestController
@RequestMapping("/api/fn")
public class PreferencesController {

    @Autowired private PreferencesService preferencesService;
    @Autowired private UserService userService;

    private Long currentUserId(String auth) {
        Long userId = userService.getUserIdFromToken(auth);
        if (userId == null) throw ApiException.unauthorized("Not authenticated");
        return userId;
    }

    @GetMapping("/getUserPreferences")
    public ApiResponse<Map<String, Object>> getUserPreferences(@RequestHeader("Authorization") String auth) {
        return ApiResponse.ok(preferencesService.getPreferences(currentUserId(auth)));
    }

    @PostMapping("/setUserPreferences")
    public ApiResponse<Map<String, Object>> setUserPreferences(@RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        return ApiResponse.ok("Preferences saved", preferencesService.setPreferences(currentUserId(auth), body));
    }
}
