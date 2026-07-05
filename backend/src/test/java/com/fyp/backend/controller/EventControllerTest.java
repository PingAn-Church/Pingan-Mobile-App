package com.fyp.backend.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.fyp.backend.service.EventService;
import com.fyp.backend.service.UserService;

@ExtendWith(MockitoExtension.class)
class EventControllerTest {

    @Mock private EventService eventService;
    @Mock private UserService userService;

    @InjectMocks private EventController eventController;

    @Test
    void checkInRejectsMissingAuthenticatedUser() {
        when(userService.getUserIdFromToken("Bearer token")).thenReturn(null);

        ResponseEntity<String> response = eventController.checkInUser(5L, 7L, "Bearer token");

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        verify(eventService, never()).checkInUser(5L, 7L);
    }

    @Test
    void checkInRejectsDifferentPathUser() {
        when(userService.getUserIdFromToken("Bearer token")).thenReturn(8L);

        ResponseEntity<String> response = eventController.checkInUser(5L, 7L, "Bearer token");

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        verify(eventService, never()).checkInUser(5L, 7L);
    }

    @Test
    void checkInUsesAuthenticatedUser() {
        when(userService.getUserIdFromToken("Bearer token")).thenReturn(7L);

        ResponseEntity<String> response = eventController.checkInUser(5L, 7L, "Bearer token");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(eventService).checkInUser(5L, 7L);
    }
}
