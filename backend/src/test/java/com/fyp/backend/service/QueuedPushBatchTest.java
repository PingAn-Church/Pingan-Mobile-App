package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collection;
import java.util.List;

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
class QueuedPushBatchTest {

    @Mock private PushTokenRepository pushTokenRepository;
    @Mock private UserRepository userRepository;
    @Mock private ConversationMuteRepository conversationMuteRepository;
    @Mock private PushMessages pushMessages;
    @Mock private UnreadCountService unreadCountService;
    @Mock private AdminAlertService adminAlertService;
    @Mock private RestTemplate restTemplate;
    @InjectMocks private PushNotificationService service;

    @Test
    void usesBulkReadsAndSkipsUsersNoLongerEligibleForSocialPush() {
        User active = user(1L, true);
        User unverified = user(2L, false);
        PushToken activeToken = token(active, "ExponentPushToken[active]");
        PushToken staleToken = token(unverified, "ExponentPushToken[stale]");

        when(conversationMuteRepository.findMutedUserIds(42L, "group", List.of(1L, 2L)))
                .thenReturn(List.of());
        when(userRepository.findAllById(List.of(1L, 2L))).thenReturn(List.of(active, unverified));
        when(pushTokenRepository.findByUserIdIn(List.of(1L, 2L)))
                .thenReturn(List.of(activeToken, staleToken));

        service.sendQueuedBatch(List.of(1L, 2L), language -> "Body", language -> "Title",
                42L, "group", null, true);

        ArgumentCaptor<HttpEntity<?>> request = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).postForObject(
                eq("https://exp.host/--/api/v2/push/send"), request.capture(), eq(String.class));
        Collection<?> payloads = (Collection<?>) request.getValue().getBody();
        assertEquals(1, payloads.size());
        verify(pushTokenRepository, never()).findByUserId(any());
        verify(userRepository, never()).findLanguageById(any());
    }

    @Test
    void transportFailureEscapesForRabbitRetry() {
        User active = user(1L, true);
        when(userRepository.findAllById(List.of(1L))).thenReturn(List.of(active));
        when(pushTokenRepository.findByUserIdIn(List.of(1L)))
                .thenReturn(List.of(token(active, "ExponentPushToken[active]")));
        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenThrow(new RuntimeException("network"));

        assertThrows(RuntimeException.class, () -> service.sendQueuedBatch(
                List.of(1L), language -> "Body", language -> "Title",
                null, "thread", 7L, false));
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
