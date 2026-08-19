package com.fyp.backend.service;

import java.time.Duration;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import com.fyp.backend.util.TotpUtil;

@Service
public class RedisService {

    // Presence: a ZSET per user (member = deviceId, score = last-seen millis) plus
    // one global index ZSET of online emails. Sorted sets because SET members can't
    // carry TTLs — expiry is the score falling out of the liveness window, pruned
    // on every read. Replaces per-device string keys that every presence question
    // had to find with KEYS, an O(keyspace) blocking scan on each connect/disconnect.
    private static final String PRESENCE_USER_KEY = "presence:user:";
    private static final String PRESENCE_ONLINE_INDEX_KEY = "presence:online";
    /** A device unheard from this long is offline (heartbeats refresh every 10s). */
    private static final long ONLINE_WINDOW_MS = 60_000;
    /** Rolling key TTL so abandoned per-user zsets vanish without a reaper. */
    private static final Duration PRESENCE_KEY_TTL = Duration.ofMinutes(10);

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

    /** Marks a device online now: last-seen stamped on both the user zset and the index. */
    public void setUserOnline(String email, String deviceId) {
        long now = System.currentTimeMillis();
        String userKey = PRESENCE_USER_KEY + email;
        redisTemplate.opsForZSet().add(userKey, deviceId, now);
        redisTemplate.expire(userKey, PRESENCE_KEY_TTL);
        redisTemplate.opsForZSet().add(PRESENCE_ONLINE_INDEX_KEY, email, now);
    }

    /** Removes one device; the user leaves the online index once no device remains live. */
    public void setDeviceOffline(String email, String deviceId) {
        String userKey = PRESENCE_USER_KEY + email;
        redisTemplate.opsForZSet().remove(userKey, deviceId);
        if (!isUserOnlineAnywhere(email)) {
            redisTemplate.delete(userKey);
            redisTemplate.opsForZSet().remove(PRESENCE_ONLINE_INDEX_KEY, email);
        }
    }

    /** Heartbeat: same write as coming online — the score IS the liveness. */
    public void refreshUserOnlineStatus(String email, String deviceId) {
        setUserOnline(email, deviceId);
    }

    /** Everyone currently online, from one pruned index read — no keyspace scan. */
    public Map<String, String> getAllOnlineUsers() {
        pruneStale(PRESENCE_ONLINE_INDEX_KEY);
        Set<String> emails = redisTemplate.opsForZSet().range(PRESENCE_ONLINE_INDEX_KEY, 0, -1);
        Map<String, String> onlineUsers = new HashMap<>();
        if (emails != null) {
            for (String email : emails) {
                onlineUsers.put(email, "online");
            }
        }
        return onlineUsers;
    }

    /** Whether any of the user's devices was heard from inside the liveness window. */
    public boolean isUserOnlineAnywhere(String email) {
        String userKey = PRESENCE_USER_KEY + email;
        pruneStale(userKey);
        Long live = redisTemplate.opsForZSet().zCard(userKey);
        return live != null && live > 0;
    }

    /** Remove all online-presence state for an account email. */
    public void clearUserOnlineStatus(String email) {
        if (email == null || email.isBlank()) {
            return;
        }
        redisTemplate.delete(PRESENCE_USER_KEY + email);
        redisTemplate.opsForZSet().remove(PRESENCE_ONLINE_INDEX_KEY, email);
    }

    /** Drops members whose last-seen fell out of the liveness window. */
    private void pruneStale(String key) {
        redisTemplate.opsForZSet().removeRangeByScore(
                key, Double.NEGATIVE_INFINITY, System.currentTimeMillis() - ONLINE_WINDOW_MS);
    }

    // ---- email verification codes (OTP) ---------------------------------
    //
    // Two flows share this machinery but must not share state: registration
    // (verify a new address) and password reset (prove ownership of an existing
    // one). The scope segment keeps their secrets, cooldowns, caps and failure
    // counters separate per email. The one-arg overloads are the registration
    // flow, unchanged for existing callers.

    /** Registration scope — empty so existing keys stay valid across deploys. */
    public static final String OTP_SCOPE_REGISTRATION = "";
    /** Password-reset scope. */
    public static final String OTP_SCOPE_RESET = "reset:";

    /**
     * Stable per-email TOTP secret so a code resent within the same time window
     * matches the one already emailed. Created on first request, expires in a day.
     */
    public String getOrCreateOtpSecret(String email) {
        return getOrCreateOtpSecret(OTP_SCOPE_REGISTRATION, email);
    }

    public String getOrCreateOtpSecret(String scope, String email) {
        String key = OTP_SECRET_KEY + scope + email;
        String secret = redisTemplate.opsForValue().get(key);
        if (secret == null) {
            secret = TotpUtil.generateSecret();
            redisTemplate.opsForValue().set(key, secret, Duration.ofHours(OTP_SECRET_TTL_HOURS));
        }
        return secret;
    }

    /** Read the stored secret without creating one (null if none/expired). */
    public String peekOtpSecret(String email) {
        return peekOtpSecret(OTP_SCOPE_REGISTRATION, email);
    }

    public String peekOtpSecret(String scope, String email) {
        return redisTemplate.opsForValue().get(OTP_SECRET_KEY + scope + email);
    }

    /** Acquire the 60s per-email cooldown slot. Returns false if one is already active. */
    public boolean tryStartOtpCooldown(String email) {
        return tryStartOtpCooldown(OTP_SCOPE_REGISTRATION, email);
    }

    public boolean tryStartOtpCooldown(String scope, String email) {
        Boolean acquired = redisTemplate.opsForValue()
                .setIfAbsent(OTP_COOLDOWN_KEY + scope + email, "1", Duration.ofSeconds(OTP_COOLDOWN_SECONDS));
        return Boolean.TRUE.equals(acquired);
    }

    /** Seconds left on the cooldown (0 if none active). */
    public long otpCooldownRemaining(String email) {
        return otpCooldownRemaining(OTP_SCOPE_REGISTRATION, email);
    }

    public long otpCooldownRemaining(String scope, String email) {
        Long ttl = redisTemplate.getExpire(OTP_COOLDOWN_KEY + scope + email);
        return ttl == null || ttl < 0 ? 0 : ttl;
    }

    /** Increment today's request count for the email; false once the daily cap is exceeded. */
    public boolean withinOtpDailyLimit(String email) {
        return withinOtpDailyLimit(OTP_SCOPE_REGISTRATION, email);
    }

    public boolean withinOtpDailyLimit(String scope, String email) {
        String key = OTP_COUNT_KEY + scope + email + ":" + LocalDate.now();
        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redisTemplate.expire(key, Duration.ofDays(1));
        }
        return count != null && count <= OTP_DAILY_MAX;
    }

    /** True once too many incorrect codes have been entered for this email recently. */
    public boolean isOtpVerifyLocked(String email) {
        return isOtpVerifyLocked(OTP_SCOPE_REGISTRATION, email);
    }

    public boolean isOtpVerifyLocked(String scope, String email) {
        String v = redisTemplate.opsForValue().get(OTP_VERIFY_FAIL_KEY + scope + email);
        if (v == null) return false;
        try {
            return Long.parseLong(v) >= OTP_VERIFY_MAX_FAILURES;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /** Record a failed verification attempt; the window resets after the lock period. */
    public void recordOtpVerifyFailure(String email) {
        recordOtpVerifyFailure(OTP_SCOPE_REGISTRATION, email);
    }

    public void recordOtpVerifyFailure(String scope, String email) {
        String key = OTP_VERIFY_FAIL_KEY + scope + email;
        Long count = redisTemplate.opsForValue().increment(key);
        if (count != null && count == 1L) {
            redisTemplate.expire(key, Duration.ofMinutes(OTP_VERIFY_LOCK_MINUTES));
        }
    }

    /** Clear OTP state after a successful verification: the (single-use) secret and the failure counter. */
    public void clearOtpState(String email) {
        clearOtpState(OTP_SCOPE_REGISTRATION, email);
    }

    public void clearOtpState(String scope, String email) {
        redisTemplate.delete(OTP_SECRET_KEY + scope + email);
        redisTemplate.delete(OTP_VERIFY_FAIL_KEY + scope + email);
    }

    // ---- Expo push receipts ---------------------------------------------
    //
    // Tickets that Expo accepted still fail later (DeviceNotRegistered often only
    // shows up in the receipt, after delivery is attempted). Each accepted ticket
    // is queued here; PushReceiptJob drains the queue and asks Expo for the
    // receipts. A plain Redis list, entries as "ticketId|epochMillis|token".

    private static final String PUSH_RECEIPT_QUEUE_KEY = "push:receipt-queue";
    private static final long PUSH_RECEIPT_QUEUE_TTL_HOURS = 48;

    public void enqueuePushReceipt(String ticketId, String token) {
        if (ticketId == null || ticketId.isBlank() || token == null || token.isBlank()) return;
        redisTemplate.opsForList().leftPush(PUSH_RECEIPT_QUEUE_KEY,
                ticketId + "|" + System.currentTimeMillis() + "|" + token);
        // Rolling TTL so an abandoned queue (job disabled, instance retired) vanishes.
        redisTemplate.expire(PUSH_RECEIPT_QUEUE_KEY, Duration.ofHours(PUSH_RECEIPT_QUEUE_TTL_HOURS));
    }

    /** Pops up to {@code max} queued receipt entries (oldest first); never null. */
    public List<String> drainPushReceipts(int max) {
        List<String> entries = new java.util.ArrayList<>();
        for (int i = 0; i < max; i++) {
            String entry = redisTemplate.opsForList().rightPop(PUSH_RECEIPT_QUEUE_KEY);
            if (entry == null) break;
            entries.add(entry);
        }
        return entries;
    }

    /** Puts an entry back (queue tail) for a later drain to retry. */
    public void requeuePushReceipt(String entry) {
        if (entry == null || entry.isBlank()) return;
        redisTemplate.opsForList().leftPush(PUSH_RECEIPT_QUEUE_KEY, entry);
        redisTemplate.expire(PUSH_RECEIPT_QUEUE_KEY, Duration.ofHours(PUSH_RECEIPT_QUEUE_TTL_HOURS));
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
