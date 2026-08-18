package com.fyp.backend.service.assistant;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import com.fyp.backend.config.app.AssistantProperties;

import lombok.RequiredArgsConstructor;

/**
 * The cheap filters in front of a paid call: has this been answered, is someone
 * else answering it, and has this person or group had enough for now.
 *
 * Redis is an optimisation here, not the guarantee. The one that matters — never
 * two replies to the same message — is the partial unique index on
 * {@code messages.responds_to_message_id}, which survives an eviction, a flush and
 * a restart. So every operation below fails OPEN: if Redis is unreachable the
 * assistant still answers, possibly paying for a duplicate call whose insert then
 * loses to the index, rather than falling silent.
 */
@Component
@RequiredArgsConstructor
public class AssistantThrottle {

    private static final Logger log = LoggerFactory.getLogger(AssistantThrottle.class);

    private static final String DONE = "assistant:done:";
    private static final String CLAIM = "assistant:claim:";
    private static final String USER_HOUR = "assistant:user:";
    private static final String CONVERSATION_DAY = "assistant:conv:";
    private static final String LIMIT_NOTICE = "assistant:limited:";

    /** Long enough that a redelivery days later still finds the marker. */
    private static final Duration DONE_TTL = Duration.ofDays(7);

    private static final DateTimeFormatter HOUR = DateTimeFormatter.ofPattern("yyyyMMddHH");

    private final StringRedisTemplate redis;
    private final AssistantProperties properties;

    public boolean alreadyAnswered(Long triggerMessageId) {
        return Boolean.TRUE.equals(safe(() -> redis.hasKey(DONE + triggerMessageId), false));
    }

    /**
     * Takes ownership of answering this message.
     *
     * The claim expires at roughly twice the provider timeout, so a worker that
     * dies mid-call releases it and a genuine retry can still go ahead — which is
     * why this is separate from the "done" marker rather than one flag.
     */
    public boolean claim(Long triggerMessageId) {
        Duration ttl = Duration.ofSeconds(Math.max(60L, properties.getTimeoutSeconds() * 2L));
        return Boolean.TRUE.equals(safe(
                () -> redis.opsForValue().setIfAbsent(CLAIM + triggerMessageId, "1", ttl), true));
    }

    public void releaseClaim(Long triggerMessageId) {
        safe(() -> redis.delete(CLAIM + triggerMessageId), false);
    }

    public void markAnswered(Long triggerMessageId) {
        safe(() -> {
            redis.opsForValue().set(DONE + triggerMessageId, "1", DONE_TTL);
            return true;
        }, true);
    }

    /**
     * Whether this request is within the per-person and per-group budgets.
     *
     * Counted at the point of asking rather than of answering, so a burst that is
     * refused still counts against the burst.
     */
    public boolean withinLimits(Long userId, Long conversationId) {
        long perUser = increment(USER_HOUR + userId + ":" + LocalDateTime.now().format(HOUR),
                Duration.ofHours(1));
        long perConversation = increment(
                CONVERSATION_DAY + conversationId + ":" + LocalDate.now(), Duration.ofDays(1));
        return perUser <= properties.getPerUserHourlyLimit()
                && perConversation <= properties.getPerConversationDailyLimit();
    }

    /**
     * Whether to say "not right now" out loud.
     *
     * Once per person per hour. Answering every blocked attempt would turn a member
     * repeatedly mentioning the assistant into the very noise the limit exists to
     * prevent — just without the API bill.
     */
    public boolean shouldAnnounceLimit(Long userId) {
        String key = LIMIT_NOTICE + userId + ":" + LocalDateTime.now().format(HOUR);
        return Boolean.TRUE.equals(safe(
                () -> redis.opsForValue().setIfAbsent(key, "1", Duration.ofHours(1)), false));
    }

    private long increment(String key, Duration ttl) {
        Long count = safe(() -> {
            Long value = redis.opsForValue().increment(key);
            if (value != null && value == 1L) {
                redis.expire(key, ttl);
            }
            return value;
        }, 0L);
        return count == null ? 0L : count;
    }

    /** Redis being down must not stop the assistant answering. */
    private <T> T safe(java.util.function.Supplier<T> operation, T fallback) {
        try {
            return operation.get();
        } catch (RuntimeException e) {
            log.warn("Assistant throttle unavailable, continuing without it: {}", e.toString());
            return fallback;
        }
    }
}
