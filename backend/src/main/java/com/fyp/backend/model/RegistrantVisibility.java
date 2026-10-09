package com.fyp.backend.model;

import java.util.Locale;

/**
 * Who may see the list of people registered for an event. The head count is
 * always public (it is how anyone can tell an event is full); the names are what
 * this controls.
 *
 * Stored on {@link Event} as its name in a plain varchar rather than through
 * {@code @Enumerated}: Hibernate 6 pins enum columns with a CHECK constraint
 * listing today's values, and adding one later would then fail on every existing
 * database until the constraint was dropped by hand (see ReportSchemaMigration
 * for the time that happened).
 */
public enum RegistrantVisibility {
    /** App admins only. The default, and what an unknown stored value falls back to. */
    ADMINS,
    /** Admins, plus anyone who has registered themselves. */
    REGISTRANTS,
    /** Every verified member who can see the event. */
    EVERYONE;

    public static RegistrantVisibility parse(String value) {
        if (value == null || value.isBlank()) {
            return ADMINS;
        }
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            return ADMINS;
        }
    }

    /** Strict variant for input: null when absent, an exception when unrecognised. */
    public static RegistrantVisibility parseInput(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            throw new IllegalArgumentException("Unknown registrant visibility: " + value);
        }
    }
}
