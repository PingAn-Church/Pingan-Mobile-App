package com.fyp.backend.jobs;

import com.fyp.backend.repository.PushTokenRepository;
import jakarta.transaction.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
/**
 * Deactivates push tokens for devices whose session is gone, i.e. there is no
 * valid (unexpired) refresh token for that user+device in the database.
 *
 * Refresh tokens live in Postgres. The cleanup is a single correlated bulk
 * update so its memory and query count stay constant as the token table grows.
 */
@Component
public class PushTokenCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(PushTokenCleanupJob.class);

    @Autowired
    private PushTokenRepository pushTokenRepository;

    /** Runs daily at 2 AM. */
    @Scheduled(cron = "0 0 2 * * *")
    @Transactional
    public void cleanupInactivePushTokens() {
        int deactivated = pushTokenRepository.deactivateWithoutValidRefreshToken(Instant.now());
        if (deactivated > 0) {
            log.info("Deactivated {} push token(s) without a valid refresh token", deactivated);
        }
    }
}
