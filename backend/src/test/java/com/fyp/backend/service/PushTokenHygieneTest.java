package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpEntity;
import org.springframework.web.client.RestTemplate;

import com.fyp.backend.model.PushToken;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Push-token lifecycle hygiene: Expo's DeviceNotRegistered must retire the token
 * (Expo throttles senders who keep pushing at dead tokens), and a device that
 * rotates its Expo token must not keep its old rows active (double sends).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PushTokenHygieneTest {

    @Mock private PushTokenRepository pushTokenRepository;
    @Mock private UserRepository userRepository;
    @Mock private ConversationMuteRepository conversationMuteRepository;
    @Mock private PushMessages pushMessages;
    @Mock private UnreadCountService unreadCountService;
    @Mock private AdminAlertService adminAlertService;
    @Mock private RedisService redisService;
    @Mock private RestTemplate restTemplate;
    @InjectMocks private PushNotificationService service;

    private static final String TOKEN_A = "ExponentPushToken[aaa]";
    private static final String TOKEN_B = "ExponentPushToken[bbb]";

    private User user(Long id) {
        User user = new User();
        user.setId(id);
        user.setEmail("user" + id + "@example.com");
        user.setLanguage("en");
        user.setActive(true);
        user.setDeletedAccount(false);
        user.setVerifiedUser(true);
        return user;
    }

    private PushToken token(User user, String value, boolean active) {
        PushToken token = new PushToken();
        token.setUser(user);
        token.setToken(value);
        token.setDeviceType("android");
        token.setDeviceId("device-" + user.getId());
        token.setActive(active);
        return token;
    }

    @Test
    void batchDeviceNotRegisteredDeactivatesExactlyThatToken() {
        User one = user(1L);
        User two = user(2L);
        when(userRepository.findAllById(List.of(1L, 2L))).thenReturn(List.of(one, two));
        when(pushTokenRepository.findByUserIdIn(List.of(1L, 2L)))
                .thenReturn(List.of(token(one, TOKEN_A, true), token(two, TOKEN_B, true)));
        // Tickets come back in request order: [0] accepted, [1] dead device.
        when(restTemplate.postForObject(anyString(), any(HttpEntity.class), eq(String.class)))
                .thenReturn("{\"data\":[{\"status\":\"ok\",\"id\":\"ticket-1\"},"
                        + "{\"status\":\"error\",\"message\":\"gone\","
                        + "\"details\":{\"error\":\"DeviceNotRegistered\"}}]}");

        service.sendQueuedBatch(List.of(1L, 2L), language -> "Body", language -> "Title",
                null, "thread", 7L, false);

        verify(pushTokenRepository).deactivateByToken(TOKEN_B);
        verify(pushTokenRepository, never()).deactivateByToken(TOKEN_A);
        verify(redisService).enqueuePushReceipt("ticket-1", TOKEN_A);
    }

    @Test
    void singleSendDeviceNotRegisteredDeactivates() {
        User one = user(1L);
        when(pushTokenRepository.findByUserId(1L)).thenReturn(List.of(token(one, TOKEN_A, true)));
        when(userRepository.findLanguageById(1L)).thenReturn(Optional.of("en"));
        when(restTemplate.postForObject(anyString(), any(HttpEntity.class), eq(String.class)))
                .thenReturn("{\"data\":{\"status\":\"error\",\"message\":\"gone\","
                        + "\"details\":{\"error\":\"DeviceNotRegistered\"}}}");

        service.sendPushNotification(List.of(1L), language -> "Body", language -> "Title",
                null, "learning");

        verify(pushTokenRepository).deactivateByToken(TOKEN_A);
    }

    @Test
    void reLoginWithRotatedTokenDeactivatesTheOldRow() {
        User one = user(1L);
        PushToken oldRow = token(one, TOKEN_A, true);
        when(userRepository.findById(1L)).thenReturn(Optional.of(one));
        when(pushTokenRepository.findByUserIdAndTokenAndDeviceId(1L, TOKEN_B, "device-1"))
                .thenReturn(Optional.empty());
        when(pushTokenRepository.findByUserIdAndDeviceId(1L, "device-1"))
                .thenReturn(List.of(oldRow));
        when(pushTokenRepository.save(any(PushToken.class))).thenAnswer(inv -> inv.getArgument(0));

        PushToken saved = service.registerPushTokenForLogin(1L, TOKEN_B, "android", "device-1");

        assertTrue(saved.isActive());
        assertFalse(oldRow.isActive()); // rotated-away token retired
        verify(pushTokenRepository).save(oldRow);
    }

    @Test
    void reRegisteringTheSameTokenDeactivatesNothing() {
        User one = user(1L);
        PushToken existing = token(one, TOKEN_A, true);
        when(userRepository.findById(1L)).thenReturn(Optional.of(one));
        when(pushTokenRepository.findByUserIdAndTokenAndDeviceId(1L, TOKEN_A, "device-1"))
                .thenReturn(Optional.of(existing));
        when(pushTokenRepository.findByUserIdAndDeviceId(1L, "device-1"))
                .thenReturn(List.of(existing));

        PushToken result = service.registerPushTokenForLogin(1L, TOKEN_A, "android", "device-1");

        assertTrue(result.isActive());
        verify(pushTokenRepository, never()).save(any(PushToken.class));
    }
}
