package com.fyp.backend.dto;

import java.time.Instant;

import com.fyp.backend.model.Event;

/**
 * Event list item. Deliberately omits {@code checkedInUserIds} (an unbounded,
 * ever-growing list) since it's only needed on the event detail/check-in view.
 *
 * The registration fields are additive: builds that predate them ignore them.
 * {@code registeredCount} and {@code registered} are filled in per page by
 * EventService (one grouped query each), and stay null/false where no viewer is
 * known, such as the assistant's event listing.
 */
public class EventSummaryDto {

    private Long id;
    private String title;
    private String description;
    private String date;
    private String startTime;
    private String endTime;
    private String location;
    private Instant startAt;
    private Instant endAt;

    private boolean registrationEnabled;
    private Integer registrationCapacity;
    private String registrantVisibility;
    private Long registeredCount;
    private boolean registered;

    public static EventSummaryDto from(Event e) {
        EventSummaryDto d = new EventSummaryDto();
        d.id = e.getId();
        d.title = e.getTitle();
        d.description = e.getDescription();
        d.date = e.getDate();
        d.startTime = e.getStartTime();
        d.endTime = e.getEndTime();
        d.location = e.getLocation();
        d.startAt = e.getStartAt();
        d.endAt = e.getEndAt();
        d.registrationEnabled = e.hasRegistration();
        d.registrationCapacity = e.getRegistrationCapacity();
        d.registrantVisibility = e.registrantVisibilityOrDefault().name();
        return d;
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public String getDate() {
        return date;
    }

    public String getStartTime() {
        return startTime;
    }

    public String getEndTime() {
        return endTime;
    }

    public String getLocation() {
        return location;
    }

    public Instant getStartAt() {
        return startAt;
    }

    public Instant getEndAt() {
        return endAt;
    }

    public boolean isRegistrationEnabled() {
        return registrationEnabled;
    }

    public Integer getRegistrationCapacity() {
        return registrationCapacity;
    }

    public String getRegistrantVisibility() {
        return registrantVisibility;
    }

    public Long getRegisteredCount() {
        return registeredCount;
    }

    public void setRegisteredCount(Long registeredCount) {
        this.registeredCount = registeredCount;
    }

    public boolean isRegistered() {
        return registered;
    }

    public void setRegistered(boolean registered) {
        this.registered = registered;
    }
}
