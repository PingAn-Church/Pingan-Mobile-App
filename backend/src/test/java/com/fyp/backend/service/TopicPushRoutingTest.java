package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Where a topic-reply notification carries its thread id.
 *
 * This is a cross-version contract, not a formatting detail. App builds released
 * before topics existed route a notification by asking "is there a conversation
 * id?" and opening a chat if so. Threads and conversations draw ids from
 * different sequences, so a thread id is very often a real conversation id too —
 * putting it in conversationId would drop those users into somebody else's chat.
 * Keeping conversationId absent makes them fall through to simply opening the app.
 */
@ExtendWith(MockitoExtension.class)
class TopicPushRoutingTest {

    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    @Mock private PushTokenRepository pushTokenRepository;
    @Mock private UserRepository userRepository;
    @Mock private ConversationMuteRepository conversationMuteRepository;
    @Mock private RestTemplate restTemplate;
    @Mock private UnreadCountService unreadCountService;
    @Mock private AdminAlertService adminAlertService;
    @Spy private PushMessages pushMessages = PushMessagesFixture.real();

    @InjectMocks private PushNotificationService pushNotificationService;

    private void device(Long userId, String language) {
        PushToken token = new PushToken();
        token.setToken("ExponentPushToken[user" + userId + "]");
        token.setActive(true);
        when(pushTokenRepository.findByUserId(userId)).thenReturn(List.of(token));
        when(userRepository.findLanguageById(userId)).thenReturn(Optional.ofNullable(language));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> capturedPayload() {
        ArgumentCaptor<HttpEntity<?>> captor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).postForObject(eq(EXPO_PUSH_URL), captor.capture(), eq(String.class));
        return (Map<String, Object>) captor.getValue().getBody();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> capturedData() {
        return (Map<String, Object>) capturedPayload().get("data");
    }

    @Test
    void theThreadIdTravelsInItsOwnFieldAndNeverAsAConversationId() {
        device(1L, "en");

        pushNotificationService.sendTopicPush(List.of(1L),
                pushMessages.literal("Anna replied: see you there"),
                pushMessages.literal("Sunday lunch"),
                57L);

        Map<String, Object> data = capturedData();
        assertEquals("thread", data.get("conversationType"));
        assertEquals("57", data.get("threadId"));
        // The line that matters: older builds open a chat when this is present.
        assertNull(data.get("conversationId"));
    }

    @Test
    void aTopicReplyLeavesTheAppIconBadgeAlone() {
        device(1L, "en");

        pushNotificationService.sendTopicPush(List.of(1L),
                pushMessages.literal("body"), pushMessages.literal("Sunday lunch"), 57L);

        // An absent badge tells the OS to keep whatever is already there — a forum
        // reply must not wipe somebody's unread message count off the icon.
        assertTrue(!capturedPayload().containsKey("badge"));
        verifyNoInteractions(unreadCountService);
    }

    @Test
    void aTopicReplyIsNotTreatedAsAChatForMuteOrCollapsePurposes() {
        device(1L, "en");

        pushNotificationService.sendTopicPush(List.of(1L),
                pushMessages.literal("body"), pushMessages.literal("Sunday lunch"), 57L);

        // Muting a conversation is unrelated to following a topic, so the mute
        // table is never consulted, and there is no conversation to collapse against.
        verify(conversationMuteRepository, times(0))
                .findByConversationIdAndConversationType(org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any());
        Map<String, Object> payload = capturedPayload();
        assertTrue(!payload.containsKey("collapseId"));
        assertTrue(!payload.containsKey("tag"));
    }

    @Test
    void nobodyToTellMeansNothingIsSent() {
        pushNotificationService.sendTopicPush(List.of(), pushMessages.literal("b"),
                pushMessages.literal("t"), 57L);
        pushNotificationService.sendTopicPush(null, pushMessages.literal("b"),
                pushMessages.literal("t"), 57L);

        verifyNoInteractions(restTemplate);
    }

    @Test
    void chatPushesStillCarryTheirConversationIdAndNoThreadId() {
        when(conversationMuteRepository.findByConversationIdAndConversationType(42L, "group"))
                .thenReturn(List.of());
        device(1L, "en");

        pushNotificationService.sendPushNotification(List.of(1L),
                pushMessages.literal("hello"), pushMessages.literal("Prayer Group"), 42L, "group");

        Map<String, Object> data = capturedData();
        assertEquals("42", data.get("conversationId"));
        assertEquals("group", data.get("conversationType"));
        assertNull(data.get("threadId"));
    }
}
