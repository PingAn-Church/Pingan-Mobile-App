package com.fyp.backend.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.Optional;
import java.util.logging.Logger;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.fyp.backend.dto.EventDto;
import com.fyp.backend.dto.EventSummaryDto;
import com.fyp.backend.model.Event;
import com.fyp.backend.repository.EventRegistrationRepository;
import com.fyp.backend.repository.EventRepository;

import jakarta.annotation.PostConstruct;
import jakarta.persistence.criteria.Predicate;

@Service
public class EventService {

    private static final Logger LOGGER = Logger.getLogger(EventService.class.getName());
    private static final ZoneId EVENT_ZONE = ZoneId.of("Asia/Singapore");
    private static final Duration CHECK_IN_WINDOW_BEFORE = Duration.ofHours(1);
    private static final Duration CHECK_IN_WINDOW_AFTER = Duration.ofHours(1);
    private static final DateTimeFormatter AM_PM_TIME =
            new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("h:mm a").toFormatter(Locale.US);

    @Autowired
    private EventRepository eventRepository;

    @Autowired
    private EventRegistrationRepository registrationRepository;

    @Autowired
    private EventRegistrationService registrationService;

    private Clock clock = Clock.systemUTC();

    @PostConstruct
    public void backfillEventDateTimes() {
        int page = 0;
        Page<Event> result;
        do {
            result = eventRepository.findAll(PageRequest.of(page++, 200));
            for (Event event : result.getContent()) {
                if (event.getStartAt() == null || event.getEndAt() == null) {
                    applyDateTimes(event);
                    if (event.getStartAt() != null || event.getEndAt() != null) {
                        eventRepository.save(event);
                    } else {
                        LOGGER.warning("Event " + event.getId() + " has unparseable date/time (date='"
                                + event.getDate() + "', startTime='" + event.getStartTime()
                                + "', endTime='" + event.getEndTime() + "'); it is listed under 'past' until fixed.");
                    }
                }
            }
        } while (result.hasNext());
    }

    public Page<EventSummaryDto> getEvents(String status, Instant from, Instant to, Pageable pageable) {
        return eventRepository.findAll(eventFilter(status, from, to), pageable)
                .map(EventSummaryDto::from);
    }

    /**
     * As above, with each item's registration head count and whether the viewer
     * has signed up. Two grouped queries for the whole page, not two per event.
     */
    public Page<EventSummaryDto> getEvents(String status, Instant from, Instant to, Pageable pageable, Long viewerId) {
        Page<EventSummaryDto> page = getEvents(status, from, to, pageable);
        registrationService.annotate(page.getContent(), viewerId);
        return page;
    }

    public Optional<Event> getEventById(Long id) {
        return eventRepository.findById(id);
    }

    public Event createEvent(EventDto eventDto) {
        Event event = new Event(
                eventDto.getTitle(),
                eventDto.getDescription(),
                eventDto.getDate(),
                eventDto.getStartTime(),
                eventDto.getEndTime(),
                eventDto.getLocation());
        applyDateTimes(event);
        EventRegistrationService.applySettings(event, eventDto.getRegistrationEnabled(),
                eventDto.getRegistrationCapacity(), eventDto.getRegistrantVisibility());
        return eventRepository.save(event);
    }

    public void checkInUser(Long eventId, Long userId) {
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));
        if (!isCheckInWindowOpen(event)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Check-in is not currently available.");
        }

        java.util.List<Long> checkedInUserIds = event.getCheckedInUserIds();
        if (checkedInUserIds.contains(userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "User already checked in.");
        }

        checkedInUserIds.add(userId);
        event.setCheckedInUserIds(checkedInUserIds);
        eventRepository.save(event);
    }

    private boolean isCheckInWindowOpen(Event event) {
        if (event.getStartAt() == null || event.getEndAt() == null) {
            return false;
        }
        Instant now = Instant.now(clock);
        Instant opensAt = event.getStartAt().minus(CHECK_IN_WINDOW_BEFORE);
        Instant closesAt = event.getEndAt().plus(CHECK_IN_WINDOW_AFTER);
        return !now.isBefore(opensAt) && !now.isAfter(closesAt);
    }

    @Transactional
    public Event updateEvent(Long id, EventDto eventDto) {
        Event event = eventRepository.findById(id).orElseThrow(() -> new RuntimeException("Event not found"));
        Instant previousStart = event.getStartAt();

        event.setTitle(eventDto.getTitle());
        event.setDescription(eventDto.getDescription());
        event.setDate(eventDto.getDate());
        event.setStartTime(eventDto.getStartTime());
        event.setEndTime(eventDto.getEndTime());
        event.setLocation(eventDto.getLocation());
        applyDateTimes(event);
        // Absent in requests from builds that predate registration: left alone.
        EventRegistrationService.applySettings(event, eventDto.getRegistrationEnabled(),
                eventDto.getRegistrationCapacity(), eventDto.getRegistrantVisibility());

        Event saved = eventRepository.save(event);
        // Moved: anyone already reminded about the old time is reminded again.
        if (!java.util.Objects.equals(previousStart, saved.getStartAt())) {
            registrationRepository.clearReminders(id);
        }
        return saved;
    }

    @Transactional
    public void deleteEvent(Long id) {
        if (!eventRepository.existsById(id)) {
            throw new RuntimeException("Event not found");
        }
        // The foreign key cascades on PostgreSQL; this keeps other databases tidy too.
        registrationRepository.deleteByEventId(id);
        eventRepository.deleteById(id);
    }

    private Specification<Event> eventFilter(String status, Instant from, Instant to) {
        return (root, query, cb) -> {
            java.util.List<Predicate> predicates = new java.util.ArrayList<>();
            Instant cutoff = Instant.now().minus(Duration.ofHours(1));
            String normalizedStatus = status == null ? "upcoming" : status.trim().toLowerCase();

            if ("upcoming".equals(normalizedStatus)) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("endAt"), cutoff));
            } else if ("past".equals(normalizedStatus)) {
                // Null endAt = unparseable legacy date/time; keep those visible here
                // instead of dropping them from every listing.
                predicates.add(cb.or(
                        cb.lessThan(root.get("endAt"), cutoff),
                        cb.isNull(root.get("endAt"))));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("startAt"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("startAt"), to));
            }

            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private void applyDateTimes(Event event) {
        Instant startAt = parseEventDateTime(event.getDate(), event.getStartTime());
        Instant endAt = parseEventDateTime(event.getDate(), event.getEndTime());
        if (startAt != null && endAt != null && !endAt.isAfter(startAt)) {
            endAt = endAt.plus(Duration.ofDays(1));
        }
        event.setStartAt(startAt);
        event.setEndAt(endAt);
    }

    private Instant parseEventDateTime(String date, String time) {
        if (date == null || date.isBlank() || time == null || time.isBlank()) {
            return null;
        }
        try {
            LocalDate localDate = LocalDate.parse(date.trim());
            LocalTime localTime = parseTime(time);
            return LocalDateTime.of(localDate, localTime).atZone(EVENT_ZONE).toInstant();
        } catch (DateTimeParseException | IllegalArgumentException e) {
            return null;
        }
    }

    private LocalTime parseTime(String value) {
        String normalized = value.replace('\u202F', ' ').replace('\u00A0', ' ').trim();
        if (normalized.toUpperCase(Locale.US).contains("AM") || normalized.toUpperCase(Locale.US).contains("PM")) {
            return LocalTime.parse(normalized.toUpperCase(Locale.US), AM_PM_TIME);
        }
        return LocalTime.parse(normalized, DateTimeFormatter.ofPattern("H:mm"));
    }
}
