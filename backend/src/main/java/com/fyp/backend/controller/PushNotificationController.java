package com.fyp.backend.controller;

import com.fyp.backend.service.PushNotificationService;
import com.fyp.backend.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/push-notifications")
public class PushNotificationController {

    @Autowired
    private PushNotificationService pushNotificationService;

    @Autowired
    private UserService userService;

    /** True when the JWT in the request does not belong to {@code userId}. */
    private boolean isNotSelf(Long userId, HttpServletRequest request) {
        Long authUserId = userService.getUserIdFromToken(request.getHeader("Authorization"));
        return authUserId == null || !authUserId.equals(userId);
    }

    // Register a push token when user registers. Deliberately unauthenticated:
    // it is called right after signup, before the user has a JWT. The token is
    // stored INACTIVE and only activated on an authenticated login.
    @PostMapping("/register")
    public ResponseEntity<?> registerPushTokenForNewUser(
            @RequestParam Long userId,
            @RequestParam String token,
            @RequestParam String deviceType,
            @RequestParam String deviceId) {
        String decodedToken = URLDecoder.decode(token, StandardCharsets.UTF_8);
        pushNotificationService.registerPushTokenForNewUser(userId, decodedToken, deviceType, deviceId);
        return ResponseEntity.ok("Push token registered successfully (inactive for new user)");
    }

    // Handle push token registration on user login (activate token)
    @PostMapping("/login")
    public ResponseEntity<?> registerPushTokenForLogin(
            @RequestParam Long userId,
            @RequestParam String token,
            @RequestParam String deviceType,
            @RequestParam String deviceId,
            HttpServletRequest request) {
        if (isNotSelf(userId, request)) {
            return ResponseEntity.status(403).body("You can only manage your own push tokens.");
        }
        String decodedToken = URLDecoder.decode(token, StandardCharsets.UTF_8);
        pushNotificationService.registerPushTokenForLogin(userId, decodedToken, deviceType, deviceId);
        return ResponseEntity.ok("Push token registered successfully (active for logged-in user)");
    }

    // Deactivate a push token
    @PostMapping("/deactivate")
    public ResponseEntity<?> deactivatePushToken(
            @RequestParam Long userId,
            @RequestParam String token,
            HttpServletRequest request) {
        if (isNotSelf(userId, request)) {
            return ResponseEntity.status(403).body("You can only manage your own push tokens.");
        }
        String decodedToken = URLDecoder.decode(token, StandardCharsets.UTF_8);
        pushNotificationService.deactivatePushToken(userId, decodedToken);
        return ResponseEntity.ok("Push token deactivated successfully");
    }

    // Unregister a push token
    @DeleteMapping("/unregister")
    public ResponseEntity<?> unregisterPushToken(
            @RequestParam Long userId,
            @RequestParam String token,
            HttpServletRequest request) {
        if (isNotSelf(userId, request)) {
            return ResponseEntity.status(403).body("You can only manage your own push tokens.");
        }
        String decodedToken = URLDecoder.decode(token, StandardCharsets.UTF_8);
        pushNotificationService.unregisterPushToken(userId, decodedToken);
        return ResponseEntity.ok("Push token unregistered successfully");
    }
}
