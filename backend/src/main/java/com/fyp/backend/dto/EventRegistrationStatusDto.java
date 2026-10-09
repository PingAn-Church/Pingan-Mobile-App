package com.fyp.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Everything a screen needs to draw one event's sign-up state for the person
 * looking at it: the event itself (so a chat share card needs a single request),
 * whether they are registered, the head count, and why registration is closed
 * when it is.
 *
 * {@code closedReason} is one of {@link #DISABLED}, {@link #STARTED} or
 * {@link #FULL}, or null while sign-up is open. A person who is already
 * registered still sees FULL once the last place goes, but it never stops them
 * cancelling.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class EventRegistrationStatusDto {

    public static final String DISABLED = "disabled";
    public static final String STARTED = "started";
    public static final String FULL = "full";

    private EventSummaryDto event;
    private boolean registrationEnabled;
    private boolean registrationOpen;
    private String closedReason;
    private boolean registered;
    private long registeredCount;
    private Integer capacity;
    private String registrantVisibility;
    private boolean canViewRegistrants;
    /** Whether the viewer could still cancel (registered, and the event has not started). */
    private boolean canCancel;
}
