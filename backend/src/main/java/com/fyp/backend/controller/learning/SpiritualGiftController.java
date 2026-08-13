package com.fyp.backend.controller.learning;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.dto.SpiritualGiftResultDto;
import com.fyp.backend.dto.SpiritualGiftSubmission;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.service.SpiritualGiftService;
import com.fyp.backend.service.UserService;

@RestController
@RequestMapping("/api/spiritual-gifts")
public class SpiritualGiftController {

    private final SpiritualGiftService spiritualGiftService;
    private final UserService userService;

    public SpiritualGiftController(SpiritualGiftService spiritualGiftService, UserService userService) {
        this.spiritualGiftService = spiritualGiftService;
        this.userService = userService;
    }

    @GetMapping("/me/result")
    public ApiResponse<SpiritualGiftResultDto> getMyResult(
            @RequestHeader("Authorization") String authorization) {
        Long userId = currentUserId(authorization);
        return ApiResponse.ok(spiritualGiftService.getLatest(userId).orElse(null));
    }

    @PutMapping("/me/result")
    public ApiResponse<SpiritualGiftResultDto> replaceMyResult(
            @RequestHeader("Authorization") String authorization,
            @RequestBody SpiritualGiftSubmission submission) {
        Long userId = currentUserId(authorization);
        return ApiResponse.ok("Spiritual gift result saved",
                spiritualGiftService.replaceLatest(userId, submission));
    }

    private Long currentUserId(String authorization) {
        Long userId = userService.getUserIdFromToken(authorization);
        if (userId == null) {
            throw ApiException.unauthorized("Not authenticated");
        }
        return userId;
    }
}
