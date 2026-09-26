package com.fyp.backend.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.ElementCollection;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(name = "events", indexes = {
        @Index(name = "idx_events_end_start_id", columnList = "end_at,start_at,id")
})
public class Event {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String title;
    private String description;
    private String date;
    private String startTime;
    private String endTime;
    private String location;
    @Column(name = "start_at")
    private Instant startAt;

    @Column(name = "end_at")
    private Instant endAt;

    @ElementCollection
    private List<Long> checkedInUserIds = new ArrayList<>(); // List of user IDs who checked in

    // Optional sign-up. All three are nullable wrappers on purpose: ddl-auto adds
    // them to a table that already has rows, where a NOT NULL column cannot be
    // added, and every event created before them reads as "no registration".

    /** Whether members can register. Null (every older event) means no. */
    @Column(name = "registration_enabled")
    private Boolean registrationEnabled;

    /** Maximum number of registrations; null means unlimited. */
    @Column(name = "registration_capacity")
    private Integer registrationCapacity;

    /** A {@link RegistrantVisibility} name; null reads as ADMINS. */
    @Column(name = "registrant_visibility", length = 32)
    private String registrantVisibility;

    // Constructors
    public Event() {}

    public Event(String title, String description, String date, String startTime, String endTime, String location) {
        this.title = title;
        this.description = description;
        this.date = date;
        this.startTime = startTime;
        this.endTime = endTime;
        this.location = location;
    }

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }

    public String getStartTime() { return startTime; }
    public void setStartTime(String startTime) { this.startTime = startTime; }

    public String getEndTime() { return endTime; }
    public void setEndTime(String endTime) { this.endTime = endTime; }

    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }

    public Instant getStartAt() { return startAt; }
    public void setStartAt(Instant startAt) { this.startAt = startAt; }

    public Instant getEndAt() { return endAt; }
    public void setEndAt(Instant endAt) { this.endAt = endAt; }

    public List<Long> getCheckedInUserIds() {
        if (checkedInUserIds == null) {
            return new ArrayList<>(); // Prevent null errors
        }
        return checkedInUserIds;
    }

    public void setCheckedInUserIds(List<Long> checkedInUserIds) { this.checkedInUserIds = checkedInUserIds; }

    public Boolean getRegistrationEnabled() { return registrationEnabled; }
    public void setRegistrationEnabled(Boolean registrationEnabled) { this.registrationEnabled = registrationEnabled; }

    public Integer getRegistrationCapacity() { return registrationCapacity; }
    public void setRegistrationCapacity(Integer registrationCapacity) { this.registrationCapacity = registrationCapacity; }

    public String getRegistrantVisibility() { return registrantVisibility; }
    public void setRegistrantVisibility(String registrantVisibility) { this.registrantVisibility = registrantVisibility; }

    // Not bean-style names, so neither lands in the JSON of GET /api/events/{id}.

    /** Null-safe reading of {@link #registrationEnabled}. */
    public boolean hasRegistration() { return Boolean.TRUE.equals(registrationEnabled); }

    /** Null-safe reading of {@link #registrantVisibility}. */
    public RegistrantVisibility registrantVisibilityOrDefault() {
        return RegistrantVisibility.parse(registrantVisibility);
    }

}
