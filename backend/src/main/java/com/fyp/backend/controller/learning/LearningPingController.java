package com.fyp.backend.controller.learning;

import java.time.Instant;
import java.util.Map;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;

/**
 * Smoke-test endpoint for the e-learning module. Gated on INSTRUCTOR so a
 * successful call as an admin proves the admin-inclusive instructor role wiring.
 */
@RestController
@RequestMapping("/api/fn")
public class LearningPingController {

    @PreAuthorize("hasRole('INSTRUCTOR')")
    @GetMapping("/ping")
    public ApiResponse<Map<String, Object>> ping() {
        return ApiResponse.ok("pong", Map.of(
                "service", "learning",
                "time", Instant.now().toString()));
    }
}
