package com.fyp.backend.controller;

import java.util.HashMap;
import java.util.Map;

import com.fyp.backend.model.RefreshToken;
import com.fyp.backend.service.RefreshTokenService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.fyp.backend.dto.LoginDto;
import com.fyp.backend.dto.UserDto;
import com.fyp.backend.dto.UserProfileDto;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.User;
import com.fyp.backend.service.AuthService;
import com.fyp.backend.service.RedisService;
import com.fyp.backend.util.JwtUtil;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;
    private final RedisService redisService;
    private final JwtUtil jwtUtil;
    private final RefreshTokenService refreshTokenService;

    @Autowired
    public AuthController(AuthService authService, JwtUtil jwtUtil, RedisService redisService, RefreshTokenService refreshTokenService) {
        this.authService = authService;
        this.jwtUtil = jwtUtil;
        this.redisService = redisService;
        this.refreshTokenService = refreshTokenService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> loginUser(@RequestBody LoginDto loginDto, @RequestParam String deviceId) {
        try {
            User user = authService.authenticateUser(loginDto);

            String accessToken = jwtUtil.generateAccessToken(user.getEmail());
            String refreshToken = jwtUtil.generateRefreshToken(user.getEmail());

            refreshTokenService.saveRefreshToken(user.getEmail(), deviceId, refreshToken, 1000L * 60 * 60 * 24 * 30);

            Map<String, Object> response = new HashMap<>();
            response.put("accessToken", accessToken);
            response.put("refreshToken", refreshToken);
            response.put("user", UserProfileDto.from(user));

            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(e.getMessage());
        }
    }

    @PostMapping("/refresh-token")
    public ResponseEntity<?> refreshToken(@RequestBody Map<String, String> requestBody, @RequestParam String deviceId) {
        String refreshToken = requestBody.get("refreshToken");
        String email = jwtUtil.extractEmail(refreshToken);

        if (email == null || !refreshTokenService.validateRefreshToken(email, deviceId, refreshToken)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid or expired refresh token");
        }

        if (!authService.isAccountActive(email)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("This account has been deactivated.");
        }

        String newAccessToken = jwtUtil.generateAccessToken(email);
        String newRefreshToken = jwtUtil.generateRefreshToken(email);

        refreshTokenService.saveRefreshToken(email, deviceId, newRefreshToken, 1000L * 60 * 60 * 24 * 30);

        Map<String, String> response = new HashMap<>();
        response.put("accessToken", newAccessToken);
        response.put("refreshToken", newRefreshToken);

        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logoutUser(@RequestBody Map<String, String> requestBody, @RequestParam String deviceId) {
        String refreshToken = requestBody.get("refreshToken");
        String email = jwtUtil.extractEmail(refreshToken);

        if (email == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid refresh token.");
        }

        refreshTokenService.deleteRefreshToken(email, deviceId);
        redisService.setDeviceOffline(email, deviceId);

        return ResponseEntity.ok("Logged out from device.");
    }


    @PostMapping("/register")
    public ResponseEntity<?> registerUser(@Valid @RequestBody UserDto userDto) {
        try {
            // Create the (unverified) account. Tokens are issued only after the
            // emailed verification code is confirmed via /verify-code.
            UserProfileDto registeredUser = authService.registerUser(userDto);
            return ResponseEntity.ok(registeredUser);
        } catch (IllegalStateException e) {
            // Email belongs to a deactivated account.
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(e.getMessage());
        } catch (IllegalArgumentException e) {
            // Email already in use by an active account.
            return ResponseEntity.status(HttpStatus.CONFLICT).body(e.getMessage());
        }
    }

    @PostMapping("/send-verification-code")
    public ResponseEntity<?> sendVerificationCode(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().body("Email is required.");
        }
        try {
            authService.sendVerificationCode(email);
            return ResponseEntity.ok("Verification code sent.");
        } catch (ApiException e) {
            return ResponseEntity.status(e.getStatus()).body(e.getMessage());
        }
    }

    @PostMapping("/verify-code")
    public ResponseEntity<?> verifyCode(@RequestBody Map<String, String> body, @RequestParam String deviceId) {
        String email = body.get("email");
        String code = body.get("code");
        if (email == null || code == null) {
            return ResponseEntity.badRequest().body("Email and code are required.");
        }
        try {
            User user = authService.verifyCode(email, code);

            // Verified — issue tokens so the app logs the user in automatically.
            String accessToken = jwtUtil.generateAccessToken(user.getEmail());
            String refreshToken = jwtUtil.generateRefreshToken(user.getEmail());
            refreshTokenService.saveRefreshToken(user.getEmail(), deviceId, refreshToken, 1000L * 60 * 60 * 24 * 30);

            Map<String, Object> response = new HashMap<>();
            response.put("accessToken", accessToken);
            response.put("refreshToken", refreshToken);
            response.put("user", UserProfileDto.from(user));

            return ResponseEntity.ok(response);
        } catch (ApiException e) {
            return ResponseEntity.status(e.getStatus()).body(e.getMessage());
        }
    }

    @PostMapping("/reset-password")
    public ResponseEntity<String> resetPassword(@RequestBody Map<String, String> request) {
        String email = request.get("email");

        if (email == null || email.isEmpty()) {
            return ResponseEntity.badRequest().body("Email is required");
        }

        authService.resetUserPassword(email);
        return ResponseEntity.ok("Password reset email sent.");
    }

    @PostMapping("/change-password")
    public ResponseEntity<String> changePassword(
        @RequestHeader("Authorization") String authorizationHeader,
        @RequestBody Map<String, String> passwords
    ) {
        String token = authorizationHeader.substring(7); // Remove "Bearer "
        String email = jwtUtil.extractEmail(token);

        String currentPassword = passwords.get("currentPassword");
        String newPassword = passwords.get("newPassword");

        try {
            authService.changeUserPassword(email, currentPassword, newPassword);
            return ResponseEntity.ok("Password changed successfully.");
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(e.getMessage());
        }
    }
}
