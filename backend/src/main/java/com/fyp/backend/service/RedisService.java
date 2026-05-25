package com.fyp.backend.service;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.fyp.backend.util.JwtUtil;

@Service
public class RedisService {

    private static final String USER_STATUS_KEY = "user_status:";
    private static final String REFRESH_TOKEN_KEY = "refresh_token:";
    private static final long ONLINE_TTL_MINUTES = 1; // Expiry time in minutes
    private static final long REFRESH_EXPIRY_DAYS = 30;

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private JwtUtil jwtUtil;

    /**
     * Mark a user as "online" per device in Redis with an expiry time.
     */
    public void setUserOnline(String email, String deviceId) {
        redisTemplate.opsForValue().set(
                USER_STATUS_KEY + email + ":" + deviceId,
                "online",
                Duration.ofMinutes(ONLINE_TTL_MINUTES)
        );
    }

    /**
     * Mark a user as "offline" and remove the device status from Redis.
     */
    public void setDeviceOffline(String email, String deviceId) {
        redisTemplate.delete(USER_STATUS_KEY + email + ":" + deviceId); // Remove the device's status key from Redis
        System.out.println("❌ Device offline: " + email + " (Device: " + deviceId + ")");
    }

    /**
     * Refresh the TTL for a user's online status per device.
     */
    public void refreshUserOnlineStatus(String email, String deviceId) {
        redisTemplate.opsForValue().set(
                USER_STATUS_KEY + email + ":" + deviceId,
                "online",
                Duration.ofMinutes(ONLINE_TTL_MINUTES) // Extend TTL
        );
    }

    /**
     * Fetch all currently online users and their devices from Redis.
     */
    public Map<String, String> getAllOnlineUsers() {
        Map<String, String> onlineUsers = new HashMap<>();
        Set<String> keys = redisTemplate.keys(USER_STATUS_KEY + "*");

        if (keys != null) {
            for (String key : keys) {
                String userEmail = key.replace(USER_STATUS_KEY, "").split(":")[0]; // Extract userEmail
                String status = redisTemplate.opsForValue().get(key);
                if ("online".equals(status)) {
                    onlineUsers.put(userEmail, "online");
                }
            }
        }

        return onlineUsers;
    }

    /**
     * Check if a user is online across any device.
     */
    public boolean isUserOnlineAnywhere(String email) {
        Set<String> keys = redisTemplate.keys(USER_STATUS_KEY + email + ":*");
        System.out.println("Keys for user " + email + ": " + keys);
        if (keys == null || keys.isEmpty()) return false;
        return keys.stream().anyMatch(k -> "online".equals(redisTemplate.opsForValue().get(k)));
    }


    /**
     * Check if a user is online on a specific device.
     */
    public boolean isUserOnline(String email, String deviceId) {
        String status = redisTemplate.opsForValue().get(USER_STATUS_KEY + email + ":" + deviceId);
        return "online".equalsIgnoreCase(status);
    }

    public List<String> getDeviceIdsForUser(String email) {
        // Get all keys matching the pattern for the user status, including deviceId
        Set<String> keys = redisTemplate.keys(USER_STATUS_KEY + email + ":*");

        // If no keys exist, return an empty list (i.e., no devices found for the user)
        if (keys == null || keys.isEmpty()) {
            return List.of();
        }

        // Extract the deviceId from the keys and return them as a list
        return keys.stream()
                .map(key -> key.replace(USER_STATUS_KEY + email + ":", "")) // Remove the user status prefix to get the deviceId
                .collect(Collectors.toList());
    }

    /**
     * Check if a refresh token is expired for a specific user and device.
     */
    public boolean isRefreshTokenExpired(String email, String deviceId) {
        String refreshToken = redisTemplate.opsForValue().get(REFRESH_TOKEN_KEY + email + ":" + deviceId);
        if (refreshToken == null) {
            return true;  // If the token doesn't exist, consider it expired
        }

        // Example: Check the expiration date from the JWT's 'exp' field (you may need to implement a decoding function here)
        return jwtUtil.isTokenExpired(refreshToken);
    }
}
