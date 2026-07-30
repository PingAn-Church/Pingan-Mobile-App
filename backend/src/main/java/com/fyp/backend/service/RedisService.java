package com.fyp.backend.service;

import java.time.Duration;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.fyp.backend.util.JwtUtil;
import com.fyp.backend.util.TotpUtil;

@Service
public class RedisService {

    private static final String USER_STATUS_KEY = "user_status:";
    private static final String REFRESH_TOKEN_KEY = "refresh_token:";
    private static final long ONLINE_TTL_MINUTES = 1; // Expiry time in minutes
    private static final long REFRESH_EXPIRY_DAYS = 30;

    // Registration email verification (OTP)
    private static final String OTP_SECRET_KEY = "otp_secret:";
    private static final String OTP_COOLDOWN_KEY = "otp_cooldown:";
    private static final String OTP_COUNT_KEY = "otp_count:";
    private static final String OTP_VERIFY_FAIL_KEY = "otp_verify_fail:";
    // Pending sign-up held here (not the DB) until the emailed code is confirmed.
    private static final String PENDING_REG_KEY = "pending_reg:";
    private static final String PENDING_REG_MEDIA_KEY = "pending_reg_media:";
    private static final long PENDING_REG_TTL_HOURS = 24;
    private static final long OTP_SECRET_TTL_HOURS = 24;
    private static final long OTP_COOLDOWN_SECONDS = 60;
    private static final long OTP_DAILY_MAX = 10;
    private static final long OTP_VERIFY_MAX_FAILURES = 5;
    private static final long OTP_VERIFY_LOCK_MINUTES = 10;

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

    /** Remove all online-presence keys for an account email. */
    public void clearUserOnlineStatus(String email) {
        if (email == null || email.isBlank()) {
            return;
        }
        Set<String> keys = redisTemplate.keys(USER_STATUS_KEY + email + ":*");
        if (keys != null && !keys.isEmpty()) {
            redisTemplate.delete(keys);
        }
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

    // ---- registration email verification (OTP) --------------------------

    /**
     * Stable per-email TOTP secret so a code resent within the same time window
     * matches the one already emailed. Created on first request, expires in a day.
     */
    public String getOrCreateOtpSecret(String email) {
        String key = OTP_SECRET_KEY + email;
        String secret = redisTemplate.opsForValue().get(key);
        if (secret == null) {
            secret = TotpUtil.generateSecret();
            redisTemplate.opsForValue().set(key, secret, Duration.ofHours(OTP_SECRET_TTL_HOURS));
        }
        return secret;
    }

    /** Read the stored secret without creating one (null if none/expired). */
    public String peekOtpSecret(String email) {
        return redisTemplate.opsForValue().get(OTP_SECRET_KEY + email);
    }

    /** Acquire the 60s per-email cooldown slot. Returns false if one is already active. */
    public boolean tryStartOtpCooldown(String email) {
        Boolean acquired = redisTemplate.opsForValue()
                .setIfAbsent(OTP_COOLDOWN_KEY + email, "1", Duration.ofSeconds(OTP_COOLDOWN_SECONDS));
        return Boolean.TRUE.equals(acquired);
    }

    /** Seconds left on the cooldown (0 if none active). */
    public long otpCooldownRemaining(String email) {
        Long ttl = redisTemplate.getExpire(OTP_COOLDOWN_KEY + email);
        return ttl == null || ttl < 0 ? 0 : ttl;
    }

    /** Increment today's request count for the email; false once the daily cap is exceeded. */
    public boolean withinOtpDailyLimit(String email) {
        String key = OTP_COUNT_KEY + email + ":" + LocalDate.now();
        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redisTemplate.expire(key, Duration.ofDays(1));
        }
        return count != null && count <= OTP_DAILY_MAX;
    }

    /** True once too many incorrect codes have been entered for this email recently. */
    public boolean isOtpVerifyLocked(String email) {
        String v = redisTemplate.opsForValue().get(OTP_VERIFY_FAIL_KEY + email);
        if (v == null) return false;
        try {
            return Long.parseLong(v) >= OTP_VERIFY_MAX_FAILURES;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /** Record a failed verification attempt; the window resets after the lock period. */
    public void recordOtpVerifyFailure(String email) {
        String key = OTP_VERIFY_FAIL_KEY + email;
        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redisTemplate.expire(key, Duration.ofMinutes(OTP_VERIFY_LOCK_MINUTES));
        }
    }

    /** Clear OTP state after a successful verification: the (single-use) secret and the failure counter. */
    public void clearOtpState(String email) {
        redisTemplate.delete(OTP_SECRET_KEY + email);
        redisTemplate.delete(OTP_VERIFY_FAIL_KEY + email);
    }

    // ---- pending registration (pre-verification sign-up) ----------------

    /**
     * Store a serialized pending sign-up keyed by email, expiring after
     * {@value #PENDING_REG_TTL_HOURS}h. Re-registering the same email before it is
     * verified overwrites the previous record (and refreshes the TTL).
     */
    public void savePendingRegistration(String email, String json) {
        redisTemplate.opsForValue().set(PENDING_REG_KEY + email, json, Duration.ofHours(PENDING_REG_TTL_HOURS));
    }

    /** Read the serialized pending sign-up for an email (null if none/expired). */
    public String getPendingRegistration(String email) {
        return redisTemplate.opsForValue().get(PENDING_REG_KEY + email);
    }

    /** Whether a pending sign-up is currently held for this email. */
    public boolean hasPendingRegistration(String email) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(PENDING_REG_KEY + email));
    }

    /** Drop the pending sign-up once the account has been materialised. */
    public void deletePendingRegistration(String email) {
        redisTemplate.delete(PENDING_REG_KEY + email);
    }

    public void markPendingRegistrationMedia(String fileName) {
        if (fileName != null && !fileName.isBlank()) {
            redisTemplate.opsForValue().set(
                    PENDING_REG_MEDIA_KEY + fileName, "1", Duration.ofHours(PENDING_REG_TTL_HOURS));
        }
    }

    public boolean isPendingRegistrationMedia(String fileName) {
        return fileName != null && Boolean.TRUE.equals(
                redisTemplate.hasKey(PENDING_REG_MEDIA_KEY + fileName));
    }

    public void clearPendingRegistrationMedia(String fileName) {
        if (fileName != null && !fileName.isBlank()) {
            redisTemplate.delete(PENDING_REG_MEDIA_KEY + fileName);
        }
    }
}
