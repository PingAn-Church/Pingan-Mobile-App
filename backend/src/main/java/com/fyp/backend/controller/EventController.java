package com.fyp.backend.controller;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.EventDto;
import com.fyp.backend.dto.EventRegistrantDto;
import com.fyp.backend.dto.EventRegistrationStatusDto;
import com.fyp.backend.dto.EventSummaryDto;
import com.fyp.backend.model.Event;
import com.fyp.backend.service.EventRegistrationService;
import com.fyp.backend.service.EventService;
import com.fyp.backend.service.UserService;
import com.fyp.backend.util.Pagination;

@RestController
@RequestMapping("/api/events")
public class EventController {

    @Autowired
    private EventService eventService;

    @Autowired
    private UserService userService;

    @Autowired
    private EventRegistrationService registrationService;

    // Fetch paged event summaries (without the per-event check-in id list)
    @GetMapping
    public Map<String, Object> getAllEvents(
            @RequestParam(defaultValue = "upcoming") String status,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "startAt,asc") String sort,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        Long viewerId = authorizationHeader == null ? null : userService.getUserIdFromToken(authorizationHeader);
        Page<EventSummaryDto> result = eventService.getEvents(
                status,
                from,
                to,
                PageRequest.of(Pagination.clampPage(page), Pagination.clampSize(size), parseSort(sort)),
                viewerId);
        return Pagination.envelope(result.getContent(), result);
    }

    /** The viewer's sign-up state for one event, with the event itself (one request per share card). */
    @PreAuthorize("hasRole('VERIFIED')")
    @GetMapping("/{id}/registration")
    public ResponseEntity<EventRegistrationStatusDto> getRegistration(
            @PathVariable Long id,
            @RequestHeader("Authorization") String authorizationHeader) {
        Long userId = userService.getUserIdFromToken(authorizationHeader);
        return ResponseEntity.ok(registrationService.status(id, userId));
    }

    /**
     * Registers the caller. Idempotent: already registered answers 200. Refused
     * sign-up (switched off, started, full) answers 409 with the current state,
     * whose closedReason says which.
     */
    @PreAuthorize("hasRole('VERIFIED')")
    @PostMapping("/{id}/registration")
    public ResponseEntity<EventRegistrationStatusDto> register(
            @PathVariable Long id,
            @RequestHeader("Authorization") String authorizationHeader) {
        Long userId = userService.getUserIdFromToken(authorizationHeader);
        EventRegistrationService.Outcome outcome = registrationService.register(id, userId);
        return ResponseEntity.status(outcome.accepted() ? HttpStatus.OK : HttpStatus.CONFLICT)
                .body(outcome.status());
    }

    /** Cancels the caller's registration. Idempotent; 409 once the event has started. */
    @PreAuthorize("hasRole('VERIFIED')")
    @DeleteMapping("/{id}/registration")
    public ResponseEntity<EventRegistrationStatusDto> cancelRegistration(
            @PathVariable Long id,
            @RequestHeader("Authorization") String authorizationHeader) {
        Long userId = userService.getUserIdFromToken(authorizationHeader);
        EventRegistrationService.Outcome outcome = registrationService.cancel(id, userId);
        return ResponseEntity.status(outcome.accepted() ? HttpStatus.OK : HttpStatus.CONFLICT)
                .body(outcome.status());
    }

    /** Who has registered; 403 unless the event's visibility setting lets the caller see it. */
    @PreAuthorize("hasRole('VERIFIED')")
    @GetMapping("/{id}/registrations")
    public ResponseEntity<List<EventRegistrantDto>> getRegistrants(
            @PathVariable Long id,
            @RequestHeader("Authorization") String authorizationHeader) {
        Long userId = userService.getUserIdFromToken(authorizationHeader);
        return ResponseEntity.ok(registrationService.registrants(id, userId));
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
    public ResponseEntity<String> checkInUser(
            @PathVariable Long id,
            @PathVariable Long userId,
            @RequestHeader("Authorization") String authorizationHeader) {
        Long authenticatedUserId = userService.getUserIdFromToken(authorizationHeader);
        if (authenticatedUserId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Not authenticated");
        }
        if (!authenticatedUserId.equals(userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("You can only check in as yourself.");
        }

        eventService.checkInUser(id, authenticatedUserId);
        return ResponseEntity.ok("User checked in successfully");
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

    private Sort parseSort(String sort) {
        String[] parts = (sort == null ? "" : sort).split(",");
        String requested = parts.length > 0 ? parts[0].trim() : "startAt";
        String property = switch (requested) {
            case "endAt", "title", "id" -> requested;
            default -> "startAt";
        };
        Sort.Direction direction = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].trim())
                ? Sort.Direction.DESC
                : Sort.Direction.ASC;
        return Sort.by(direction, property).and(Sort.by(Sort.Direction.ASC, "id"));
    }

}
