package com.fyp.backend.dto;

import com.fyp.backend.model.Event;

/**
 * Event list item. Deliberately omits {@code checkedInUserIds} (an unbounded,
 * ever-growing list) since it's only needed on the event detail/check-in view.
 */
public class EventSummaryDto {

    private Long id;
    private String title;
    private String description;
    private String date;
    private String startTime;
    private String endTime;
    private String location;

    public static EventSummaryDto from(Event e) {
        EventSummaryDto d = new EventSummaryDto();
        d.id = e.getId();
        d.title = e.getTitle();
        d.description = e.getDescription();
        d.date = e.getDate();
        d.startTime = e.getStartTime();
        d.endTime = e.getEndTime();
        d.location = e.getLocation();
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
}
