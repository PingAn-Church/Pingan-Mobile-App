package com.fyp.backend.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.fyp.backend.dto.EventRegistrantDto;
import com.fyp.backend.dto.EventRegistrationStatusDto;
import com.fyp.backend.dto.EventSummaryDto;
import com.fyp.backend.model.Event;
import com.fyp.backend.model.EventRegistration;
import com.fyp.backend.model.RegistrantVisibility;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.EventRegistrationRepository;
import com.fyp.backend.repository.EventRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Optional sign-up for events.
 *
 * Registering and cancelling are idempotent: the same share card can sit in
 * several chats and be pressed in each, and a retried request must not error on
 * the second attempt. Both run under a row lock on the event (see
 * {@link EventRepository#findByIdForUpdate}), which is what keeps a capacity
 * check and the insert that follows it from racing.
 *
 * Sign-up closes when the event starts. Cancelling is allowed up to the same
 * moment; after that the list is a record of who said they were coming.
 */
@Service
public class EventRegistrationService {

    /** Whether a register/cancel request went through, and the state to redraw from either way. */
    public record Outcome(boolean accepted, EventRegistrationStatusDto status) {}

    private final EventRepository eventRepository;
    private final EventRegistrationRepository registrationRepository;
    private final UserRepository userRepository;
    private final Duration reminderLead;

    // Non-final so tests can pin the time.
    private Clock clock = Clock.systemUTC();

    public EventRegistrationService(EventRepository eventRepository,
            EventRegistrationRepository registrationRepository,
            UserRepository userRepository,
            @Value("${events.reminder.lead-minutes:60}") long reminderLeadMinutes) {
        this.eventRepository = eventRepository;
        this.registrationRepository = registrationRepository;
        this.userRepository = userRepository;
        this.reminderLead = Duration.ofMinutes(Math.max(0, reminderLeadMinutes));
    }

    void setClock(Clock clock) {
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public EventRegistrationStatusDto status(Long eventId, Long viewerId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        return statusFor(event, requireUser(viewerId));
    }

    @Transactional
    public Outcome register(Long eventId, Long userId) {
        Event event = eventRepository.findByIdForUpdate(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        User user = requireUser(userId);

        if (registrationRepository.existsByEventIdAndUserId(eventId, userId)) {
            return new Outcome(true, statusFor(event, user));
        }
        String closed = closedReason(event, registrationRepository.countByEventId(eventId));
        if (closed != null) {
            return new Outcome(false, statusFor(event, user));
        }

        Instant now = Instant.now(clock);
        EventRegistration registration = new EventRegistration(eventId, userId, now);
        // Signing up inside the reminder window: they have just looked at the
        // start time, so a "starting soon" push a minute later would only be noise.
        if (event.getStartAt() != null && !event.getStartAt().isAfter(now.plus(reminderLead))) {
            registration.setReminderSentAt(now);
        }
        registrationRepository.save(registration);
        return new Outcome(true, statusFor(event, user));
    }

    @Transactional
    public Outcome cancel(Long eventId, Long userId) {
        Event event = eventRepository.findByIdForUpdate(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        User user = requireUser(userId);

        EventRegistration registration = registrationRepository.findByEventIdAndUserId(eventId, userId)
                .orElse(null);
        if (registration == null) {
            return new Outcome(true, statusFor(event, user));
        }
        if (hasStarted(event)) {
            return new Outcome(false, statusFor(event, user));
        }
        registrationRepository.delete(registration);
        registrationRepository.flush();
        return new Outcome(true, statusFor(event, user));
    }

    /**
     * The registrant list, if this viewer may see it. The rule lives on the
     * server; the app hiding the list is presentation, not protection.
     */
    @Transactional(readOnly = true)
    public List<EventRegistrantDto> registrants(Long eventId, Long viewerId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        User viewer = requireUser(viewerId);
        boolean registered = registrationRepository.existsByEventIdAndUserId(eventId, viewerId);
        if (!canViewRegistrants(event, viewer, registered)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You cannot view this event's registrants.");
        }

        List<EventRegistration> rows = registrationRepository.findByEventIdOrderByCreatedAtAscIdAsc(eventId);
        Map<Long, User> users = new HashMap<>();
        userRepository.findAllById(rows.stream().map(EventRegistration::getUserId).toList())
                .forEach(u -> users.put(u.getId(), u));
        Set<Long> checkedIn = new HashSet<>(event.getCheckedInUserIds());

        List<EventRegistrantDto> result = new ArrayList<>();
        for (EventRegistration row : rows) {
            User u = users.get(row.getUserId());
            if (u == null || u.isDeletedAccount()) continue;
            result.add(new EventRegistrantDto(
                    u.getId(),
                    u.getFirstName(),
                    u.getLastName(),
                    u.getProfileImage(),
                    viewer.isAdmin() ? u.getEmail() : null,
                    row.getCreatedAt(),
                    checkedIn.contains(u.getId())));
        }
        return result;
    }

    /** One event's worth of due reminders, detached from the persistence context. */
    public record ReminderBatch(Long eventId, String title, String startTime, String location,
            List<Long> userIds) {}

    /**
     * Finds every registration whose event starts within the reminder lead time,
     * marks them reminded, and hands them back grouped by event.
     *
     * Marked before anything is sent, deliberately: at most once. A reminder lost
     * to an Expo outage is a smaller harm than the same "starting soon" arriving
     * twice after a retry — and pushes are sent after this commits, outside it.
     */
    @Transactional
    public List<ReminderBatch> claimDueReminders() {
        Instant now = Instant.now(clock);
        List<EventRegistration> due = registrationRepository.findDueReminders(now, now.plus(reminderLead));
        if (due.isEmpty()) return List.of();

        Map<Long, List<EventRegistration>> byEvent = new java.util.LinkedHashMap<>();
        for (EventRegistration registration : due) {
            byEvent.computeIfAbsent(registration.getEventId(), ignored -> new ArrayList<>()).add(registration);
        }

        List<ReminderBatch> batches = new ArrayList<>();
        for (Map.Entry<Long, List<EventRegistration>> entry : byEvent.entrySet()) {
            Event event = eventRepository.findById(entry.getKey()).orElse(null);
            if (event == null) continue;
            List<Long> registrationIds = entry.getValue().stream().map(EventRegistration::getId).toList();
            registrationRepository.markReminded(registrationIds, now);
            batches.add(new ReminderBatch(event.getId(), event.getTitle(), event.getStartTime(),
                    event.getLocation(),
                    entry.getValue().stream().map(EventRegistration::getUserId).distinct().toList()));
        }
        return batches;
    }

    /** Head counts and the viewer's own sign-ups for a page of list items. */
    public void annotate(Collection<EventSummaryDto> summaries, Long viewerId) {
        if (summaries == null || summaries.isEmpty()) return;
        List<Long> ids = summaries.stream().map(EventSummaryDto::getId).toList();
        Map<Long, Long> counts = new HashMap<>();
        for (Object[] row : registrationRepository.countByEventIds(ids)) {
            counts.put((Long) row[0], ((Number) row[1]).longValue());
        }
        Set<Long> mine = viewerId == null
                ? Set.of()
                : new HashSet<>(registrationRepository.findRegisteredEventIds(viewerId, ids));
        for (EventSummaryDto summary : summaries) {
            summary.setRegisteredCount(counts.getOrDefault(summary.getId(), 0L));
            summary.setRegistered(mine.contains(summary.getId()));
        }
    }

    EventRegistrationStatusDto statusFor(Event event, User viewer) {
        long count = registrationRepository.countByEventId(event.getId());
        boolean registered = registrationRepository.existsByEventIdAndUserId(event.getId(), viewer.getId());
        String closed = closedReason(event, count);

        EventSummaryDto summary = EventSummaryDto.from(event);
        summary.setRegisteredCount(count);
        summary.setRegistered(registered);

        return new EventRegistrationStatusDto(
                summary,
                event.hasRegistration(),
                closed == null,
                closed,
                registered,
                count,
                event.getRegistrationCapacity(),
                event.registrantVisibilityOrDefault().name(),
                canViewRegistrants(event, viewer, registered),
                registered && !hasStarted(event));
    }

    private String closedReason(Event event, long count) {
        if (!event.hasRegistration()) {
            return EventRegistrationStatusDto.DISABLED;
        }
        if (hasStarted(event)) {
            return EventRegistrationStatusDto.STARTED;
        }
        Integer capacity = event.getRegistrationCapacity();
        if (capacity != null && capacity > 0 && count >= capacity) {
            return EventRegistrationStatusDto.FULL;
        }
        return null;
    }

    /**
     * Started, by the parsed schedule. An event whose date/time never parsed has
     * no startAt; it stays open rather than locking everybody out over a typo.
     */
    private boolean hasStarted(Event event) {
        return event.getStartAt() != null && !Instant.now(clock).isBefore(event.getStartAt());
    }

    static boolean canViewRegistrants(Event event, User viewer, boolean registered) {
        if (viewer.isAdmin()) return true;
        return switch (event.registrantVisibilityOrDefault()) {
            case EVERYONE -> true;
            case REGISTRANTS -> registered;
            case ADMINS -> false;
        };
    }

    private User requireUser(Long userId) {
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated");
        }
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated"));
    }

    /** Validates and applies the registration settings an admin sent. Null fields are left alone. */
    static void applySettings(Event event, Boolean enabled, Integer capacity, String visibility) {
        if (enabled != null) {
            event.setRegistrationEnabled(enabled);
        }
        if (capacity != null) {
            if (capacity > 100_000) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Registration capacity is too large.");
            }
            event.setRegistrationCapacity(capacity > 0 ? capacity : null);
        }
        if (visibility != null) {
            RegistrantVisibility parsed;
            try {
                parsed = RegistrantVisibility.parseInput(visibility);
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
            }
            if (parsed != null) {
                event.setRegistrantVisibility(parsed.name());
            }
        }
    }
}
