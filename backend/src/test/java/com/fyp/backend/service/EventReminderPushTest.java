package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.web.client.RestTemplate;

import com.fyp.backend.model.PushToken;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class EventReminderPushTest {

    @Mock private PushTokenRepository pushTokenRepository;
    @Mock private UserRepository userRepository;
    @Mock private ConversationMuteRepository conversationMuteRepository;
    @Mock private PushMessages pushMessages;
    @Mock private UnreadCountService unreadCountService;
    @Mock private AdminAlertService adminAlertService;
    @Mock private RestTemplate restTemplate;
    @InjectMocks private PushNotificationService service;

    @Test
    void carriesTheEventInItsOwnKeyAndSkipsMembersNoLongerVerified() {
        User verified = user(1L, true);
        User unverified = user(2L, false);
        when(userRepository.findAllById(List.of(1L, 2L))).thenReturn(List.of(verified, unverified));
        when(pushTokenRepository.findByUserIdIn(List.of(1L, 2L)))
                .thenReturn(List.of(token(verified, "ExponentPushToken[a]"), token(unverified, "ExponentPushToken[b]")));

        service.notifyEventReminder(List.of(1L, 2L), 9L, language -> "Starting soon", language -> "Body");

        ArgumentCaptor<HttpEntity<?>> request = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).postForObject(eq("https://exp.host/--/api/v2/push/send"),
                request.capture(), eq(String.class));
        List<?> payloads = (List<?>) request.getValue().getBody();
        assertEquals(1, payloads.size());

        Map<?, ?> payload = (Map<?, ?>) payloads.get(0);
        Map<?, ?> data = (Map<?, ?>) payload.get("data");
        assertEquals("event-reminder", data.get("conversationType"));
        assertEquals("9", data.get("eventId"));
        // Never conversationId: older builds would open a chat with that id.
        assertFalse(data.containsKey("conversationId"));
        assertFalse(payload.containsKey("badge"));
    }

    @Test
    void aTransportFailureNeverEscapes() {
        User verified = user(1L, true);
        when(userRepository.findAllById(List.of(1L))).thenReturn(List.of(verified));
        when(pushTokenRepository.findByUserIdIn(List.of(1L)))
                .thenReturn(List.of(token(verified, "ExponentPushToken[a]")));
        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenThrow(new RuntimeException("network"));

        service.notifyEventReminder(List.of(1L), 9L, language -> "t", language -> "b"); // must not throw
    }

    private User user(Long id, boolean verified) {
        User user = new User();
        user.setId(id);
        user.setEmail("user" + id + "@example.com");
        user.setLanguage("en");
        user.setActive(true);
        user.setDeletedAccount(false);
        user.setVerifiedUser(verified);
        return user;
    }

    private PushToken token(User user, String value) {
        PushToken token = new PushToken();
        token.setUser(user);
        token.setToken(value);
        token.setDeviceType("android");
        token.setDeviceId("device-" + user.getId());
        token.setActive(true);
        return token;
    }
}
