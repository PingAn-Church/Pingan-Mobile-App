package com.fyp.backend.jobs;

import java.time.LocalDate;
import java.time.ZoneId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.UserPreferences;
import com.fyp.backend.repository.UserPreferencesRepository;

/**
 * Resets a learner's daily streak once they miss a day. Runs daily; mirrors the
 * existing scheduled-job pattern ({@code PushTokenCleanupJob}). Streak increments
 * happen live on activity — this job only zeroes out lapsed streaks.
 */
@Component
public class StreakMaintenanceJob {

    private static final Logger log = LoggerFactory.getLogger(StreakMaintenanceJob.class);

    @Autowired private UserPreferencesRepository preferencesRepository;

    /** Runs daily at 03:00 server time. */
    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void resetLapsedStreaks() {
        int reset = 0;
        int pageNum = 0;
        Page<UserPreferences> page;
        // Process in fixed-size pages so the whole preferences table never loads at once.
        do {
            page = preferencesRepository.findAll(PageRequest.of(pageNum, 200, Sort.by("id")));
            for (UserPreferences p : page.getContent()) {
                if (p.getCurrentStreak() == null || p.getCurrentStreak() == 0) continue;
                LocalDate today = LocalDate.now(zoneOf(p.getTimezone()));
                LocalDate last = parseDate(p.getLastActivityDate());
                // Lapsed if no activity today or yesterday.
                if (last == null || last.isBefore(today.minusDays(1))) {
                    p.setCurrentStreak(0);
                    preferencesRepository.save(p);
                    reset++;
                }
            }
            pageNum++;
        } while (page.hasNext());
        if (reset > 0) log.info("Reset {} lapsed learning streak(s)", reset);
    }

    private ZoneId zoneOf(String tz) {
        try {
            return tz == null || tz.isBlank() ? ZoneId.of("UTC") : ZoneId.of(tz);
        } catch (Exception e) {
            return ZoneId.of("UTC");
        }
    }

    private LocalDate parseDate(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return LocalDate.parse(s);
        } catch (Exception e) {
            return null;
        }
    }
}
