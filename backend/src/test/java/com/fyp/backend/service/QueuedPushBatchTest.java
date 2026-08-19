package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
        // Every sub-batch fails, nothing was delivered — the ONE case where Rabbit
        // redelivery cannot duplicate, so the exception must escape.
        User active = user(1L, true);
        when(userRepository.findAllById(List.of(1L))).thenReturn(List.of(active));
        when(pushTokenRepository.findByUserIdIn(List.of(1L)))
                .thenReturn(List.of(token(active, "ExponentPushToken[active]")));
        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenThrow(new RuntimeException("network"));

        assertThrows(RuntimeException.class, () -> service.sendQueuedBatch(
                List.of(1L), language -> "Body", language -> "Title",
                null, "thread", 7L, false));
        // Each sub-batch gets a short local retry before giving up.
        verify(restTemplate, times(3)).postForObject(
                any(String.class), any(HttpEntity.class), eq(String.class));
    }

    @Test
    void partialSubBatchFailureDoesNotEscapeToRabbit() {
        // 150 device payloads -> two Expo sub-batches. The first fails through all
        // local retries, the second succeeds; redelivering the whole task would
        // re-send the successful sub-batch as duplicate notifications, so no
        // exception may escape.
        User active = user(1L, true);
        List<PushToken> tokens = new java.util.ArrayList<>();
        for (int i = 0; i < 150; i++) {
            tokens.add(token(active, "ExponentPushToken[t" + i + "]"));
        }
        when(userRepository.findAllById(List.of(1L))).thenReturn(List.of(active));
        when(pushTokenRepository.findByUserIdIn(List.of(1L))).thenReturn(tokens);
        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenThrow(new RuntimeException("network"))
                .thenThrow(new RuntimeException("network"))
                .thenThrow(new RuntimeException("network"))
                .thenReturn("{\"data\":[]}");

        service.sendQueuedBatch(List.of(1L), language -> "Body", language -> "Title",
                null, "thread", 7L, false); // must not throw

        verify(restTemplate, times(4)).postForObject(
                any(String.class), any(HttpEntity.class), eq(String.class));
    }

    @Test
    void transientFailureRecoversWithinLocalRetries() {
        User active = user(1L, true);
        when(userRepository.findAllById(List.of(1L))).thenReturn(List.of(active));
        when(pushTokenRepository.findByUserIdIn(List.of(1L)))
                .thenReturn(List.of(token(active, "ExponentPushToken[active]")));
        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenThrow(new RuntimeException("blip"))
                .thenReturn("{\"data\":[]}");

        service.sendQueuedBatch(List.of(1L), language -> "Body", language -> "Title",
                null, "thread", 7L, false); // must not throw

        verify(restTemplate, times(2)).postForObject(
                any(String.class), any(HttpEntity.class), eq(String.class));
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
