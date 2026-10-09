package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import com.fyp.backend.dto.EventDto;
import com.fyp.backend.model.Event;
import com.fyp.backend.repository.EventRegistrationRepository;
import com.fyp.backend.repository.EventRepository;

@ExtendWith(MockitoExtension.class)
class EventServiceTest {

    private static final Instant NOW = Instant.parse("2026-07-04T04:00:00Z");

    @Mock private EventRepository eventRepository;
    @Mock private EventRegistrationRepository registrationRepository;
    @Mock private EventRegistrationService registrationService;

    @InjectMocks private EventService eventService;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(eventService, "clock", Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void checkInAcceptsAuthenticatedUserInsideServerWindow() {
        Event event = event(NOW.plusSeconds(30 * 60), NOW.plusSeconds(90 * 60));
        when(eventRepository.findById(5L)).thenReturn(Optional.of(event));
        when(eventRepository.save(any(Event.class))).thenAnswer(inv -> inv.getArgument(0));

        eventService.checkInUser(5L, 7L);

        assertEquals(new ArrayList<>(java.util.List.of(7L)), event.getCheckedInUserIds());
        verify(eventRepository).save(event);
    }

    @Test
    void checkInRejectsBeforeServerWindow() {
        Event event = event(NOW.plusSeconds(2 * 60 * 60), NOW.plusSeconds(3 * 60 * 60));
        when(eventRepository.findById(5L)).thenReturn(Optional.of(event));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> eventService.checkInUser(5L, 7L));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(eventRepository, never()).save(any());
    }

    @Test
    void checkInRejectsAfterServerWindow() {
        Event event = event(NOW.minusSeconds(3 * 60 * 60), NOW.minusSeconds(2 * 60 * 60));
        when(eventRepository.findById(5L)).thenReturn(Optional.of(event));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> eventService.checkInUser(5L, 7L));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(eventRepository, never()).save(any());
    }

    @Test
    void checkInRejectsDuplicateUser() {
        Event event = event(NOW.minusSeconds(30 * 60), NOW.plusSeconds(30 * 60));
        event.setCheckedInUserIds(new ArrayList<>(java.util.List.of(7L)));
        when(eventRepository.findById(5L)).thenReturn(Optional.of(event));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> eventService.checkInUser(5L, 7L));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(eventRepository, never()).save(any());
    }

    @Test
    void checkInRejectsEventsWithoutParsedSchedule() {
        Event event = new Event();
        when(eventRepository.findById(5L)).thenReturn(Optional.of(event));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> eventService.checkInUser(5L, 7L));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(eventRepository, never()).save(any());
    }

    @Test
    void editingFromABuildWithoutRegistrationKeepsTheEventsSignUpSettings() {
        // The current app's edit form sends only the original six fields. That
        // must not switch registration off or wipe the capacity/visibility.
        Event event = scheduled("2026-10-04", "10:00 AM", "12:00 PM");
        event.setRegistrationEnabled(true);
        event.setRegistrationCapacity(40);
        event.setRegistrantVisibility("EVERYONE");
        when(eventRepository.findById(5L)).thenReturn(Optional.of(event));
        when(eventRepository.save(any(Event.class))).thenAnswer(inv -> inv.getArgument(0));

        Event saved = eventService.updateEvent(5L, legacyDto("2026-10-04", "10:00 AM", "12:00 PM"));

        assertEquals(Boolean.TRUE, saved.getRegistrationEnabled());
        assertEquals(40, saved.getRegistrationCapacity());
        assertEquals("EVERYONE", saved.getRegistrantVisibility());
        verify(registrationRepository, never()).clearReminders(any());
    }

    @Test
    void reschedulingClearsRemindersSoTheNewTimeIsRemindedToo() {
        Event event = scheduled("2026-10-04", "10:00 AM", "12:00 PM");
        when(eventRepository.findById(5L)).thenReturn(Optional.of(event));
        when(eventRepository.save(any(Event.class))).thenAnswer(inv -> inv.getArgument(0));

        eventService.updateEvent(5L, legacyDto("2026-10-05", "10:00 AM", "12:00 PM"));

        verify(registrationRepository).clearReminders(5L);
    }

    @Test
    void newEventsTakeTheirRegistrationSettingsFromTheForm() {
        EventDto dto = legacyDto("2026-10-04", "10:00 AM", "12:00 PM");
        dto.setRegistrationEnabled(true);
        dto.setRegistrationCapacity(0);
        dto.setRegistrantVisibility("REGISTRANTS");
        when(eventRepository.save(any(Event.class))).thenAnswer(inv -> inv.getArgument(0));

        Event created = eventService.createEvent(dto);

        assertEquals(Boolean.TRUE, created.getRegistrationEnabled());
        assertEquals(null, created.getRegistrationCapacity());
        assertEquals("REGISTRANTS", created.getRegistrantVisibility());
    }

    @Test
    void deletingAnEventDeletesItsRegistrations() {
        when(eventRepository.existsById(5L)).thenReturn(true);

        eventService.deleteEvent(5L);

        verify(registrationRepository).deleteByEventId(5L);
        verify(eventRepository).deleteById(5L);
    }

    private Event scheduled(String date, String start, String end) {
        Event event = new Event("Service", "desc", date, start, end, "Hall");
        ReflectionTestUtils.invokeMethod(eventService, "applyDateTimes", event);
        return event;
    }

    private EventDto legacyDto(String date, String start, String end) {
        EventDto dto = new EventDto();
        dto.setTitle("Service");
        dto.setDescription("desc");
        dto.setDate(date);
        dto.setStartTime(start);
        dto.setEndTime(end);
        dto.setLocation("Hall");
        return dto;
    }

    private Event event(Instant startAt, Instant endAt) {
        Event event = new Event();
        event.setStartAt(startAt);
        event.setEndAt(endAt);
        event.setCheckedInUserIds(new ArrayList<>());
        return event;
    }
}
