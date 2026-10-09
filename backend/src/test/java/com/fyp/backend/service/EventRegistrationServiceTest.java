package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.fyp.backend.dto.EventRegistrantDto;
import com.fyp.backend.dto.EventRegistrationStatusDto;
import com.fyp.backend.model.Event;
import com.fyp.backend.model.EventRegistration;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.EventRegistrationRepository;
import com.fyp.backend.repository.EventRepository;
import com.fyp.backend.repository.UserRepository;

class EventRegistrationServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-01T02:00:00Z");

    private final EventRepository eventRepository = mock(EventRepository.class);
    private final EventRegistrationRepository registrations = mock(EventRegistrationRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private EventRegistrationService service;

    @BeforeEach
    void setUp() {
        service = new EventRegistrationService(eventRepository, registrations, userRepository, 60);
        service.setClock(Clock.fixed(NOW, ZoneOffset.UTC));
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(7L, false)));
        when(userRepository.findById(1L)).thenReturn(Optional.of(user(1L, true)));
    }

    @Test
    void registersWhileOpenAndReportsTheNewState() {
        Event event = event(5L, NOW.plusSeconds(3 * 24 * 3600), true, null);
        when(eventRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(event));
        when(registrations.existsByEventIdAndUserId(5L, 7L)).thenReturn(false, true);
        when(registrations.countByEventId(5L)).thenReturn(0L, 1L);

        EventRegistrationService.Outcome outcome = service.register(5L, 7L);

        ArgumentCaptor<EventRegistration> saved = ArgumentCaptor.forClass(EventRegistration.class);
        verify(registrations).save(saved.capture());
        assertEquals(7L, saved.getValue().getUserId());
        assertNull(saved.getValue().getReminderSentAt(), "far-off event still owes a reminder");
        assertTrue(outcome.accepted());
        assertTrue(outcome.status().isRegistered());
        assertEquals(1L, outcome.status().getRegisteredCount());
        assertTrue(outcome.status().isCanCancel());
    }

    @Test
    void registeringTwiceIsNotAnError() {
        // The same share card can be pressed in two chats; the second press must
        // answer "you're registered", not fail.
        Event event = event(5L, NOW.plusSeconds(3600 * 5), true, null);
        when(eventRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(event));
        when(registrations.existsByEventIdAndUserId(5L, 7L)).thenReturn(true);
        when(registrations.countByEventId(5L)).thenReturn(1L);

        EventRegistrationService.Outcome outcome = service.register(5L, 7L);

        assertTrue(outcome.accepted());
        verify(registrations, never()).save(any());
    }

    @Test
    void refusesOnceFull() {
        Event event = event(5L, NOW.plusSeconds(3600 * 5), true, 2);
        when(eventRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(event));
        when(registrations.countByEventId(5L)).thenReturn(2L);

        EventRegistrationService.Outcome outcome = service.register(5L, 7L);

        assertFalse(outcome.accepted());
        assertEquals(EventRegistrationStatusDto.FULL, outcome.status().getClosedReason());
        verify(registrations, never()).save(any());
    }

    @Test
    void refusesWhenSwitchedOffOrAlreadyStarted() {
        Event off = event(5L, NOW.plusSeconds(3600 * 5), null, null);
        when(eventRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(off));
        assertEquals(EventRegistrationStatusDto.DISABLED,
                service.register(5L, 7L).status().getClosedReason());

        Event started = event(6L, NOW.minusSeconds(60), true, null);
        when(eventRepository.findByIdForUpdate(6L)).thenReturn(Optional.of(started));
        EventRegistrationService.Outcome outcome = service.register(6L, 7L);
        assertFalse(outcome.accepted());
        assertEquals(EventRegistrationStatusDto.STARTED, outcome.status().getClosedReason());
        verify(registrations, never()).save(any());
    }

    @Test
    void anEventWithoutAParsedStartStaysOpen() {
        Event unparsed = event(5L, null, true, null);
        when(eventRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(unparsed));

        assertTrue(service.register(5L, 7L).accepted());
        verify(registrations).save(any(EventRegistration.class));
    }

    @Test
    void signingUpInsideTheReminderWindowCountsAsReminded() {
        Event soon = event(5L, NOW.plusSeconds(20 * 60), true, null);
        when(eventRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(soon));

        service.register(5L, 7L);

        ArgumentCaptor<EventRegistration> saved = ArgumentCaptor.forClass(EventRegistration.class);
        verify(registrations).save(saved.capture());
        assertEquals(NOW, saved.getValue().getReminderSentAt());
    }

    @Test
    void cancelIsIdempotentAndClosesAtTheStart() {
        Event future = event(5L, NOW.plusSeconds(3600), true, null);
        when(eventRepository.findByIdForUpdate(5L)).thenReturn(Optional.of(future));
        when(registrations.findByEventIdAndUserId(5L, 7L)).thenReturn(Optional.empty());
        assertTrue(service.cancel(5L, 7L).accepted());

        EventRegistration mine = new EventRegistration(5L, 7L, NOW.minusSeconds(60));
        when(registrations.findByEventIdAndUserId(5L, 7L)).thenReturn(Optional.of(mine));
        assertTrue(service.cancel(5L, 7L).accepted());
        verify(registrations).delete(mine);

        Event started = event(6L, NOW.minusSeconds(60), true, null);
        EventRegistration late = new EventRegistration(6L, 7L, NOW.minusSeconds(3600));
        when(eventRepository.findByIdForUpdate(6L)).thenReturn(Optional.of(started));
        when(registrations.findByEventIdAndUserId(6L, 7L)).thenReturn(Optional.of(late));
        assertFalse(service.cancel(6L, 7L).accepted());
        verify(registrations, never()).delete(late);
    }

    @Test
    void registrantListFollowsTheEventsVisibility() {
        Event adminsOnly = event(5L, NOW.plusSeconds(3600), true, null);
        adminsOnly.setRegistrantVisibility("ADMINS");
        when(eventRepository.findById(5L)).thenReturn(Optional.of(adminsOnly));
        when(registrations.existsByEventIdAndUserId(5L, 7L)).thenReturn(true);

        ResponseStatusException denied = assertThrows(ResponseStatusException.class,
                () -> service.registrants(5L, 7L));
        assertEquals(HttpStatus.FORBIDDEN, denied.getStatusCode());

        adminsOnly.setRegistrantVisibility("REGISTRANTS");
        when(registrations.findByEventIdOrderByCreatedAtAscIdAsc(5L)).thenReturn(List.of());
        assertEquals(List.of(), service.registrants(5L, 7L));

        when(registrations.existsByEventIdAndUserId(5L, 7L)).thenReturn(false);
        assertThrows(ResponseStatusException.class, () -> service.registrants(5L, 7L));

        adminsOnly.setRegistrantVisibility("EVERYONE");
        assertEquals(List.of(), service.registrants(5L, 7L));
    }

    @Test
    void onlyAdminsSeeRegistrantEmails() {
        Event event = event(5L, NOW.plusSeconds(3600), true, null);
        event.setRegistrantVisibility("EVERYONE");
        event.setCheckedInUserIds(new java.util.ArrayList<>(List.of(9L)));
        when(eventRepository.findById(5L)).thenReturn(Optional.of(event));
        when(registrations.findByEventIdOrderByCreatedAtAscIdAsc(5L))
                .thenReturn(List.of(new EventRegistration(5L, 9L, NOW.minusSeconds(600))));
        when(userRepository.findAllById(List.of(9L))).thenReturn(List.of(user(9L, false)));

        EventRegistrantDto asMember = service.registrants(5L, 7L).get(0);
        EventRegistrantDto asAdmin = service.registrants(5L, 1L).get(0);

        assertNull(asMember.getEmail());
        assertEquals("user9@example.com", asAdmin.getEmail());
        assertTrue(asAdmin.isCheckedIn());
    }

    @Test
    void settingsLeaveAbsentFieldsAloneAndTreatZeroCapacityAsUnlimited() {
        Event event = event(5L, NOW, true, 30);
        event.setRegistrantVisibility("EVERYONE");

        // What a build that predates registration sends: nothing at all.
        EventRegistrationService.applySettings(event, null, null, null);
        assertTrue(event.hasRegistration());
        assertEquals(30, event.getRegistrationCapacity());
        assertEquals("EVERYONE", event.getRegistrantVisibility());

        EventRegistrationService.applySettings(event, false, 0, "registrants");
        assertFalse(event.hasRegistration());
        assertNull(event.getRegistrationCapacity());
        assertEquals("REGISTRANTS", event.getRegistrantVisibility());

        ResponseStatusException bad = assertThrows(ResponseStatusException.class,
                () -> EventRegistrationService.applySettings(event, null, null, "friends"));
        assertEquals(HttpStatus.BAD_REQUEST, bad.getStatusCode());
    }

    @Test
    void claimingDueRemindersMarksThemAndGroupsByEvent() {
        EventRegistration a = registration(11L, 5L, 7L);
        EventRegistration b = registration(12L, 5L, 8L);
        EventRegistration c = registration(13L, 6L, 7L);
        when(registrations.findDueReminders(NOW, NOW.plusSeconds(3600))).thenReturn(List.of(a, b, c));
        Event five = event(5L, NOW.plusSeconds(1800), true, null);
        five.setTitle("Sunday Service");
        five.setStartTime("10:00 AM");
        when(eventRepository.findById(5L)).thenReturn(Optional.of(five));
        when(eventRepository.findById(6L)).thenReturn(Optional.of(event(6L, NOW.plusSeconds(1800), true, null)));

        List<EventRegistrationService.ReminderBatch> batches = service.claimDueReminders();

        assertEquals(2, batches.size());
        assertEquals(List.of(7L, 8L), batches.get(0).userIds());
        assertEquals("Sunday Service", batches.get(0).title());
        verify(registrations).markReminded(eq(List.of(11L, 12L)), eq(NOW));
        verify(registrations).markReminded(eq(List.of(13L)), eq(NOW));
    }

    private Event event(Long id, Instant startAt, Boolean enabled, Integer capacity) {
        Event event = new Event();
        event.setId(id);
        event.setStartAt(startAt);
        event.setEndAt(startAt == null ? null : startAt.plusSeconds(3600));
        event.setRegistrationEnabled(enabled);
        event.setRegistrationCapacity(capacity);
        event.setCheckedInUserIds(new java.util.ArrayList<>());
        return event;
    }

    private EventRegistration registration(Long id, Long eventId, Long userId) {
        EventRegistration registration = new EventRegistration(eventId, userId, NOW.minusSeconds(86400));
        registration.setId(id);
        return registration;
    }

    private User user(Long id, boolean admin) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        user.setAdmin(admin);
        return user;
    }
}
