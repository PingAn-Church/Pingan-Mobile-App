package com.fyp.backend.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.ApiResponse;
import com.fyp.backend.dto.AppReleaseDto;
import com.fyp.backend.service.AppReleaseService;

@RestController
@RequestMapping("/api/app-releases")
public class AppReleaseController {

    private final AppReleaseService appReleaseService;

    public AppReleaseController(AppReleaseService appReleaseService) {
        this.appReleaseService = appReleaseService;
    }

    @GetMapping("/latest")
    public ApiResponse<AppReleaseDto> latest(
            @RequestParam(defaultValue = "android") String platform,
            @RequestParam(defaultValue = "direct") String channel) {
        return ApiResponse.ok("Latest app release", appReleaseService.getLatest(platform, channel));
    }
}
