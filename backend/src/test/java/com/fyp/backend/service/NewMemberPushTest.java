package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.web.client.RestTemplate;

import com.fyp.backend.model.PushToken;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * A new account can do nothing until an admin verifies it, so the sign-up alert
 * is the one push the admin side depends on. Two things are easy to get wrong
 * and are pinned here: the alert must not quietly overwrite the recipient's
 * unread-message count on the app icon, and it must never be able to cost
 * somebody their registration.
 */
@ExtendWith(MockitoExtension.class)
class NewMemberPushTest {

    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    @Mock private PushTokenRepository pushTokenRepository;
    @Mock private UserRepository userRepository;
    @Mock private ConversationMuteRepository conversationMuteRepository;
    @Mock private RestTemplate restTemplate;
    @Mock private UnreadCountService unreadCountService;
    @Mock private AdminAlertService adminAlertService;
    @Spy private PushMessages pushMessages = PushMessagesFixture.real();

    @InjectMocks private PushNotificationService pushNotificationService;

    /** Gives an admin one active device and the language they reported. */
    private void device(Long userId, String language) {
        PushToken token = new PushToken();
        token.setToken("ExponentPushToken[user" + userId + "]");
        token.setActive(true);
        when(pushTokenRepository.findByUserId(userId)).thenReturn(List.of(token));
        when(userRepository.findLanguageById(userId)).thenReturn(Optional.ofNullable(language));
    }

    private static User joiner(String firstName, String lastName) {
        User u = new User();
        u.setId(57L);
        u.setFirstName(firstName);
        u.setLastName(lastName);
        return u;
    }

    @SuppressWarnings("unchecked")
    private static String field(HttpEntity<?> entity, String name) {
        return String.valueOf(((Map<String, Object>) entity.getBody()).get(name));
    }

    private List<HttpEntity<?>> capturedPushes(int count) {
        ArgumentCaptor<HttpEntity<?>> captor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate, times(count))
                .postForObject(eq(EXPO_PUSH_URL), captor.capture(), eq(String.class));
        return List.copyOf(captor.getAllValues());
    }

    @Test
    void everyAdminIsToldInTheirOwnLanguage() {
        when(adminAlertService.alertableAdminIds()).thenReturn(List.of(1L, 2L));
        device(1L, "zh");
        device(2L, "en");

        pushNotificationService.notifyAdminsOfNewMember(joiner("伟", "张"));

        List<HttpEntity<?>> pushes = capturedPushes(2);
        assertEquals("新成员加入", field(pushes.get(0), "title"));
        // Family name first for the Chinese reader, given name first for English —
        // the same ordering they would see on the member's row in the app.
        assertEquals("张伟 刚刚注册，正在等待审核。", field(pushes.get(0), "body"));
        assertEquals("New member", field(pushes.get(1), "title"));
        assertEquals("伟 张 just joined and is waiting to be verified.", field(pushes.get(1), "body"));
    }

    @Test
    void theIconBadgeCarriesUnreadMessagesAndWaitingSignUpsTogether() {
        when(adminAlertService.alertableAdminIds()).thenReturn(List.of(1L));
        when(unreadCountService.totalUnreadFor(1L)).thenReturn(2L);
        when(adminAlertService.unseenNewMemberCount(1L)).thenReturn(3L);
        device(1L, "en");

        pushNotificationService.notifyAdminsOfNewMember(joiner("New", "User"));

        // Sending 3 here would knock the admin's two unread messages off the icon;
        // there is only one badge, so it has to be the whole total.
        assertEquals("5", field(capturedPushes(1).get(0), "badge"));
    }

    @Test
    void aLaterChatPushDoesNotWipeTheAdminsWaitingMemberCount() {
        when(conversationMuteRepository.findMutedUserIds(42L, "group", List.of(1L)))
                .thenReturn(List.of());
        when(unreadCountService.totalUnreadFor(1L)).thenReturn(4L);
        when(adminAlertService.unseenNewMemberCount(1L)).thenReturn(2L);
        device(1L, "en");

        pushNotificationService.sendPushNotification(List.of(1L),
                pushMessages.literal("hello"), pushMessages.literal("Church"), 42L, "group");

        assertEquals("6", field(capturedPushes(1).get(0), "badge"));
    }

    @Test
    void nothingIsSentWhenThereIsNobodyToTell() {
        when(adminAlertService.alertableAdminIds()).thenReturn(List.of());

        pushNotificationService.notifyAdminsOfNewMember(joiner("New", "User"));

        verifyNoInteractions(restTemplate);
    }

    @Test
    void aFailingAlertNeverCostsSomebodyTheirRegistration() {
        when(adminAlertService.alertableAdminIds())
                .thenThrow(new RuntimeException("database is having a moment"));

        assertDoesNotThrow(() -> pushNotificationService.notifyAdminsOfNewMember(joiner("New", "User")));
        assertDoesNotThrow(() -> pushNotificationService.notifyAdminsOfNewMember(null));
        verifyNoInteractions(restTemplate);
    }

    @Test
    void theAlertIsTaggedSoTheAppCanRouteItToTheUserList() {
        when(adminAlertService.alertableAdminIds()).thenReturn(List.of(1L));
        device(1L, "en");

        pushNotificationService.notifyAdminsOfNewMember(joiner("New", "User"));

        @SuppressWarnings("unchecked")
        Map<String, Object> body = (Map<String, Object>) capturedPushes(1).get(0).getBody();
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) body.get("data");
        assertEquals("new-member", data.get("conversationType"));
        // No conversation id: this is not a chat, and the app must not try to open one.
        assertEquals(null, data.get("conversationId"));
        verify(conversationMuteRepository, times(0))
                .findMutedUserIds(any(), any(), any());
    }
}
