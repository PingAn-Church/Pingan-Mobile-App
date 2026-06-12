package com.fyp.backend.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fyp.backend.model.UserPreferences;
import com.fyp.backend.repository.UserPreferencesRepository;

/** Read/write user learning preferences; also the home for streak bookkeeping. */
@Service
public class PreferencesService {

    @Autowired private UserPreferencesRepository preferencesRepository;

    public UserPreferences getOrCreate(Long userId) {
        return preferencesRepository.findByUserId(userId).orElseGet(() -> {
            UserPreferences p = new UserPreferences();
            p.setUserId(userId);
            return preferencesRepository.save(p);
        });
    }

    public Map<String, Object> getPreferences(Long userId) {
        return toMap(getOrCreate(userId));
    }

    public Map<String, Object> setPreferences(Long userId, Map<String, Object> body) {
        UserPreferences p = getOrCreate(userId);
        if (body.containsKey("timezone")) p.setTimezone(str(body.get("timezone"), p.getTimezone()));
        if (body.containsKey("themePreference")) p.setThemePreference(str(body.get("themePreference"), p.getThemePreference()));
        if (body.containsKey("emailNotifications")) p.setEmailNotifications(bool(body.get("emailNotifications"), p.isEmailNotifications()));
        if (body.containsKey("pushNotifications")) p.setPushNotifications(bool(body.get("pushNotifications"), p.isPushNotifications()));
        return toMap(preferencesRepository.save(p));
    }

    /** Today's date in the user's configured timezone (ISO yyyy-MM-dd). */
    public String todayInUserZone(Long userId) {
        return LocalDate.now(zoneOf(getOrCreate(userId).getTimezone())).toString();
    }

    /**
     * Advances the daily streak for one activity: same day = no change, the next
     * day = +1, any longer gap = reset to 1. Returns the saved preferences.
     */
    public UserPreferences recordStreakActivity(Long userId) {
        UserPreferences p = getOrCreate(userId);
        LocalDate today = LocalDate.now(zoneOf(p.getTimezone()));
        LocalDate last = parseDate(p.getLastActivityDate());

        int streak;
        if (last == null) {
            streak = 1;
        } else if (last.equals(today)) {
            streak = p.getCurrentStreak() == null || p.getCurrentStreak() < 1 ? 1 : p.getCurrentStreak();
        } else if (last.equals(today.minusDays(1))) {
            streak = (p.getCurrentStreak() == null ? 0 : p.getCurrentStreak()) + 1;
        } else {
            streak = 1;
        }
        p.setCurrentStreak(streak);
        p.setLongestStreak(Math.max(p.getLongestStreak() == null ? 0 : p.getLongestStreak(), streak));
        p.setLastActivityDate(today.toString());
        return preferencesRepository.save(p);
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

    private Map<String, Object> toMap(UserPreferences p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("timezone", p.getTimezone());
        m.put("theme_preference", p.getThemePreference());
        m.put("email_notifications", p.isEmailNotifications());
        m.put("push_notifications", p.isPushNotifications());
        m.put("current_streak", p.getCurrentStreak());
        m.put("longest_streak", p.getLongestStreak());
        m.put("last_activity_date", p.getLastActivityDate());
        return m;
    }

    private String str(Object v, String def) {
        return v == null ? def : String.valueOf(v);
    }

    private boolean bool(Object v, boolean def) {
        if (v == null) return def;
        if (v instanceof Boolean b) return b;
        return Boolean.parseBoolean(String.valueOf(v).trim());
    }
}
