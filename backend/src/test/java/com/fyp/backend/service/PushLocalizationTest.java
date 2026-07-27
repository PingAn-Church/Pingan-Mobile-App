package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
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
 * Push text is written by the backend and rendered by the OS, so it never passes
 * through the app's i18n bundle — it has to be composed in each recipient's own
 * language, taken from what their device last reported.
 */
@ExtendWith(MockitoExtension.class)
class PushLocalizationTest {

    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    @Mock private PushTokenRepository pushTokenRepository;
    @Mock private UserRepository userRepository;
    @Mock private ConversationMuteRepository conversationMuteRepository;
    @Mock private RestTemplate restTemplate;
    @Mock private UnreadCountService unreadCountService;
    @Spy private PushMessages pushMessages = PushMessagesFixture.real();

    @InjectMocks private PushNotificationService pushNotificationService;

    /** Gives a user one active device and the language they reported. */
    private void device(Long userId, String language) {
        PushToken token = new PushToken();
        token.setToken("ExponentPushToken[user" + userId + "]");
        token.setActive(true);
        when(pushTokenRepository.findByUserId(userId)).thenReturn(List.of(token));
        when(userRepository.findLanguageById(userId))
                .thenReturn(Optional.ofNullable(language));
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
    void learningPushIsWrittenInTheRecipientsLanguage() {
        device(1L, "zh");
        pushNotificationService.notifyLearningEvent(1L,
                "push.learning.enrolled.title", "push.learning.enrolled.body", "Prayer 101");

        HttpEntity<?> push = capturedPushes(1).get(0);
        assertEquals("报名成功", field(push, "title"));
        assertEquals("您已报名《Prayer 101》，开始学习吧！", field(push, "body"));
    }

    @Test
    void englishRecipientKeepsTheEnglishWording() {
        device(1L, "en");
        pushNotificationService.notifyLearningEvent(1L,
                "push.learning.enrolled.title", "push.learning.enrolled.body", "Prayer 101");

        HttpEntity<?> push = capturedPushes(1).get(0);
        assertEquals("Enrolled", field(push, "title"));
        assertEquals("You're enrolled in \"Prayer 101\". Time to start learning!", field(push, "body"));
    }

    @Test
    void recipientWhoNeverReportedALanguageFallsBackToEnglish() {
        device(1L, null);
        pushNotificationService.notifyLearningEvent(1L,
                "push.learning.goalReached.title", "push.learning.goalReached.body", "Read daily");

        HttpEntity<?> push = capturedPushes(1).get(0);
        assertEquals("Goal reached", field(push, "title"));
        assertEquals("You completed your goal: \"Read daily\".", field(push, "body"));
    }

    @Test
    void oneSendReachesTwoRecipientsInTheirOwnLanguages() {
        when(conversationMuteRepository.findByConversationIdAndConversationType(42L, "group"))
                .thenReturn(List.of());
        device(1L, "zh");
        device(2L, "en");

        pushNotificationService.sendPushNotification(List.of(1L, 2L),
                pushMessages.text("push.chat.voice"),
                pushMessages.literal("Prayer Group"),
                42L, "group");

        List<HttpEntity<?>> pushes = capturedPushes(2);
        assertEquals("🎤 语音消息", field(pushes.get(0), "body"));
        assertEquals("🎤 Voice message", field(pushes.get(1), "body"));
        // A group's name is its own; only our own wording is translated.
        assertEquals("Prayer Group", field(pushes.get(0), "title"));
        assertEquals("Prayer Group", field(pushes.get(1), "title"));
    }

    @Test
    void privateChatTitleFollowsTheReadersNameOrder() {
        when(conversationMuteRepository.findByConversationIdAndConversationType(any(), eq("private")))
                .thenReturn(List.of());
        device(1L, "zh");
        device(2L, "en");

        pushNotificationService.sendPushNotification(List.of(1L, 2L),
                pushMessages.literal("在吗？"),
                pushMessages.personName("伟", "张"),
                8L, "private");

        List<HttpEntity<?>> pushes = capturedPushes(2);
        assertEquals("张伟", field(pushes.get(0), "title"));   // family name first
        assertEquals("伟 张", field(pushes.get(1), "title"));  // given name first
        // The sender's own words are never rewritten for either reader.
        assertEquals("在吗？", field(pushes.get(0), "body"));
        assertEquals("在吗？", field(pushes.get(1), "body"));
    }

    @Test
    void latinNamesKeepTheirSpaceEvenInChinese() {
        LocalizedText name = pushMessages.personName("John", "Smith");
        assertEquals("John Smith", name.render("en"));
        assertEquals("Smith John", name.render("zh"));
    }
}
