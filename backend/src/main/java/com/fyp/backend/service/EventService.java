package com.fyp.backend.service;

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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.dto.EventDto;
import com.fyp.backend.dto.EventSummaryDto;
import com.fyp.backend.model.Event;
import com.fyp.backend.repository.EventRepository;

import jakarta.annotation.PostConstruct;
import jakarta.persistence.criteria.Predicate;

@Service
public class EventService {

    private static final Logger LOGGER = Logger.getLogger(EventService.class.getName());
    private static final ZoneId EVENT_ZONE = ZoneId.of("Asia/Singapore");
    private static final DateTimeFormatter AM_PM_TIME =
            new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern("h:mm a").toFormatter(Locale.US);

    @Autowired
    private EventRepository eventRepository;

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
        return eventRepository.save(event);
    }

    public boolean checkInUser(Long eventId, Long userId) {
        Optional<Event> optionalEvent = eventRepository.findById(eventId);
        if (optionalEvent.isPresent()) {
            Event event = optionalEvent.get();
            if (!event.getCheckedInUserIds().contains(userId)) {
                event.getCheckedInUserIds().add(userId);
                eventRepository.save(event);
                return true;
            }
        }
        return false;
    }

    @Transactional
    public Event updateEvent(Long id, EventDto eventDto) {
        Event event = eventRepository.findById(id).orElseThrow(() -> new RuntimeException("Event not found"));

        event.setTitle(eventDto.getTitle());
        event.setDescription(eventDto.getDescription());
        event.setDate(eventDto.getDate());
        event.setStartTime(eventDto.getStartTime());
        event.setEndTime(eventDto.getEndTime());
        event.setLocation(eventDto.getLocation());
        applyDateTimes(event);

        return eventRepository.save(event);
    }

    public void deleteEvent(Long id) {
        if (!eventRepository.existsById(id)) {
            throw new RuntimeException("Event not found");
        }
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
