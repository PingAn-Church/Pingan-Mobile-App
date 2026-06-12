package com.fyp.backend.jobs;

import com.fyp.backend.model.PushToken;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.repository.RefreshTokenRepository;
import jakarta.transaction.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Deactivates push tokens for devices whose session is gone, i.e. there is no
 * valid (unexpired) refresh token for that user+device in the database.
 *
 * Refresh tokens live in Postgres ({@link RefreshTokenRepository}) — NOT in
 * Redis. The previous version of this job consulted Redis keys that were never
 * written, so every device that happened to be online at 2 AM had its push
 * tokens wrongly deactivated.
 */
@Component
public class PushTokenCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(PushTokenCleanupJob.class);

    @Autowired
    private PushTokenRepository pushTokenRepository;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    /** Runs daily at 2 AM. */
    @Scheduled(cron = "0 0 2 * * *")
    @Transactional
    public void cleanupInactivePushTokens() {
        Instant now = Instant.now();
        List<PushToken> activeTokens = pushTokenRepository.findAllActive();
        List<PushToken> toDeactivate = new ArrayList<>();

        for (PushToken token : activeTokens) {
            String email = token.getUser().getEmail();
            boolean hasValidRefresh = refreshTokenRepository
                    .findByUserEmailAndDeviceId(email, token.getDeviceId())
                    .map(rt -> rt.getExpiresAt().isAfter(now))
                    .orElse(false);

            if (!hasValidRefresh) {
                token.setActive(false);
                toDeactivate.add(token);
            }
        }

        if (!toDeactivate.isEmpty()) {
            pushTokenRepository.saveAll(toDeactivate);
            log.info("Deactivated {} push token(s) without a valid refresh token", toDeactivate.size());
        }
    }
}
