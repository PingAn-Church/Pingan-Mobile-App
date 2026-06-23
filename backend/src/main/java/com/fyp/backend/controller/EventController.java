package com.fyp.backend.controller;

import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.EventDto;
import com.fyp.backend.dto.EventSummaryDto;
import com.fyp.backend.model.Event;
import com.fyp.backend.service.EventService;

@RestController
@RequestMapping("/api/events")
public class EventController {

    @Autowired
    private EventService eventService;

    // Fetch all events (summaries without the per-event check-in id list)
    @GetMapping
    public List<EventSummaryDto> getAllEvents() {
        return eventService.getAllEvents();
    }

    // Fetch event by ID
    @GetMapping("/{id}")
    public Optional<Event> getEventById(@PathVariable Long id) {
        return eventService.getEventById(id);
    }

    // Create a new event
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public Event createEvent(@RequestBody EventDto eventDto) {
        return eventService.createEvent(eventDto);
    }

    // User checks into an event
    @PreAuthorize("hasRole('VERIFIED')")
    @PostMapping("/{id}/checkin/{userId}")
    public String checkInUser(@PathVariable Long id, @PathVariable Long userId) {
        boolean success = eventService.checkInUser(id, userId);
        return success ? "User checked in successfully" : "User already checked in or event not found";
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    public ResponseEntity<Event> updateEvent(@PathVariable Long id, @RequestBody EventDto eventDto) {
        Event updatedEvent = eventService.updateEvent(id, eventDto);
        return ResponseEntity.ok(updatedEvent);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<String> deleteEvent(@PathVariable Long id) {
        eventService.deleteEvent(id);
        return ResponseEntity.ok("Event deleted successfully");
    }

}
