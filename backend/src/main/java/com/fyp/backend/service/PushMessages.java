package com.fyp.backend.service;

import java.util.Locale;

import org.springframework.context.MessageSource;
import org.springframework.context.NoSuchMessageException;
import org.springframework.stereotype.Component;

/**
 * Resolves push notification text into a recipient's language.
 *
 * Notification bodies and titles are composed server-side and displayed by the
 * OS, so unlike in-app copy they never pass through the client's i18n bundle —
 * whatever the backend writes is what the user reads. Everything here therefore
 * returns a {@link LocalizedText} recipe that the push service renders once per
 * recipient, from the language that recipient's device last reported.
 */
@Component
public class PushMessages {

    /** Used when a recipient has never reported a language (matches the previous behaviour). */
    private static final Locale FALLBACK = Locale.ENGLISH;

    // CJK ideograph ranges (Unified + Ext-A + Compatibility), mirroring the
    // frontend's utils/formatName.js so a name reads the same in a notification
    // as it does inside the app.
    private static final String CJK_REGEX = ".*[\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF].*";

    private final MessageSource messageSource;

    public PushMessages(MessageSource messageSource) {
        this.messageSource = messageSource;
    }

    /** Maps a reported app language onto a bundle locale, tolerating null/junk. */
    static Locale toLocale(String language) {
        if (language == null || language.isBlank()) return FALLBACK;
        String normalized = language.trim().toLowerCase(Locale.ROOT);
        if (normalized.startsWith("zh")) return Locale.SIMPLIFIED_CHINESE;
        if (normalized.startsWith("en")) return Locale.ENGLISH;
        return FALLBACK;
    }

    /** Looks a key up immediately; falls back to the key itself if it is missing. */
    public String get(String language, String key, Object... args) {
        try {
            return messageSource.getMessage(key, args, toLocale(language));
        } catch (NoSuchMessageException missing) {
            return key;
        }
    }

    /** A bundle key resolved against whichever recipient the push reaches. */
    public LocalizedText text(String key, Object... args) {
        return language -> get(language, key, args);
    }

    /** Text that is the same for everyone — a group name, a user's own words. */
    public LocalizedText literal(String value) {
        return language -> value == null ? "" : value;
    }

    /**
     * A person's name in the recipient's reading order: Chinese puts the family
     * name first, English keeps given-first. The join is CJK-aware — Chinese
     * characters run together (张 + 伟 → 张伟) while Latin names keep a space.
     */
    public LocalizedText personName(String firstName, String lastName) {
        String first = firstName == null ? "" : firstName.trim();
        String last = lastName == null ? "" : lastName.trim();
        if (first.isEmpty() || last.isEmpty()) {
            String single = first.isEmpty() ? last : first;
            return language -> single;
        }
        return language -> {
            if (!Locale.SIMPLIFIED_CHINESE.equals(toLocale(language))) {
                return first + " " + last;
            }
            String separator = (first.matches(CJK_REGEX) || last.matches(CJK_REGEX)) ? "" : " ";
            return last + separator + first;
        };
    }
}
