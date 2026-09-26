package com.fyp.backend.dto;

public class EventDto {
    private String title;
    private String description;
    private String date;
    private String startTime;
    private String endTime;
    private String location;

    // Registration settings. Every one is a wrapper where null means "leave as it
    // is": builds released before registration existed send none of them, and an
    // admin editing an event from one must not silently switch its sign-up off.
    private Boolean registrationEnabled;
    /** Null leaves it unchanged; zero or less means unlimited. */
    private Integer registrationCapacity;
    /** A RegistrantVisibility name; null leaves it unchanged. */
    private String registrantVisibility;

    // Getters and Setters
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

    public Boolean getRegistrationEnabled() { return registrationEnabled; }
    public void setRegistrationEnabled(Boolean registrationEnabled) { this.registrationEnabled = registrationEnabled; }

    public Integer getRegistrationCapacity() { return registrationCapacity; }
    public void setRegistrationCapacity(Integer registrationCapacity) { this.registrationCapacity = registrationCapacity; }

    public String getRegistrantVisibility() { return registrantVisibility; }
    public void setRegistrantVisibility(String registrantVisibility) { this.registrantVisibility = registrantVisibility; }

}
