package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpOutputMessage;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.model.PushToken;
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Guards the Expo payload against two regressions that the hand-concatenated
 * JSON string used to cause:
 *
 * <ul>
 *   <li>a raw String body selects Spring's StringHttpMessageConverter, whose
 *       default charset is ISO-8859-1 — it cannot encode CJK or emoji and
 *       replaced each one with '?', so a Chinese message arrived as "???";</li>
 *   <li>nothing escaped the title/body, so a quote or newline (every learning
 *       notification wraps a course title in quotes) produced malformed JSON
 *       that Expo rejected outright.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class PushNotificationEncodingTest {

    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
    private static final Long RECIPIENT = 7L;

    @Mock private PushTokenRepository pushTokenRepository;
    @Mock private UserRepository userRepository;
    @Mock private ConversationMuteRepository conversationMuteRepository;
    @Mock private RestTemplate restTemplate;
    @Mock private UnreadCountService unreadCountService;
    @Spy private PushMessages pushMessages = PushMessagesFixture.real();

    @InjectMocks private PushNotificationService pushNotificationService;

    /** Runs a send to one active Chinese-speaking Android device. */
    private HttpEntity<?> capturePush(Runnable send) {
        return capturePush("android", send);
    }

    /** As above, for a named device platform — the payload differs between the two. */
    private HttpEntity<?> capturePush(String deviceType, Runnable send) {
        PushToken token = new PushToken();
        token.setToken("ExponentPushToken[abcdef123456]");
        token.setActive(true);
        token.setDeviceType(deviceType);
        when(pushTokenRepository.findByUserId(RECIPIENT)).thenReturn(List.of(token));
        when(userRepository.findLanguageById(RECIPIENT)).thenReturn(Optional.of("zh"));

        send.run();

        ArgumentCaptor<HttpEntity<?>> captor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).postForObject(eq(EXPO_PUSH_URL), captor.capture(), eq(String.class));
        return captor.getValue();
    }

    /** Serialises the captured entity exactly as RestTemplate would put it on the wire. */
    private static byte[] onTheWire(HttpEntity<?> entity) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        HttpHeaders headers = new HttpHeaders();
        headers.putAll(entity.getHeaders());
        new MappingJackson2HttpMessageConverter().write(
                entity.getBody(),
                entity.getHeaders().getContentType(),
                new HttpOutputMessage() {
                    @Override public OutputStream getBody() { return out; }
                    @Override public HttpHeaders getHeaders() { return headers; }
                });
        return out.toByteArray();
    }

    private static JsonNode parse(HttpEntity<?> entity) throws Exception {
        return new ObjectMapper().readTree(new String(onTheWire(entity), StandardCharsets.UTF_8));
    }

    @Test
    void chineseTitleAndBodyReachExpoIntactRatherThanAsQuestionMarks() throws Exception {
        when(conversationMuteRepository.findByConversationIdAndConversationType(42L, "private"))
                .thenReturn(List.of());

        HttpEntity<?> entity = capturePush(() -> pushNotificationService.sendPushNotification(
                List.of(RECIPIENT),
                pushMessages.literal("你好啊"),
                pushMessages.personName("伟", "张"),
                42L, "private"));

        assertEquals(MediaType.APPLICATION_JSON, entity.getHeaders().getContentType());

        String wire = new String(onTheWire(entity), StandardCharsets.UTF_8);
        assertFalse(wire.contains("?"), "no character may degrade to '?': " + wire);

        JsonNode json = new ObjectMapper().readTree(wire);
        assertEquals("张伟", json.path("title").asText());
        assertEquals("你好啊", json.path("body").asText());
        assertEquals("42", json.path("data").path("conversationId").asText());
        assertEquals("private", json.path("data").path("conversationType").asText());
    }

    @Test
    void emojiMediaPlaceholdersSurvive() throws Exception {
        when(conversationMuteRepository.findByConversationIdAndConversationType(9L, "group"))
                .thenReturn(List.of());

        HttpEntity<?> entity = capturePush(() -> pushNotificationService.sendPushNotification(
                List.of(RECIPIENT),
                pushMessages.text("push.chat.photo"),
                pushMessages.literal("主日崇拜小组"),
                9L, "group"));

        JsonNode json = parse(entity);
        assertEquals("🖼️ 图片", json.path("body").asText());
        assertEquals("主日崇拜小组", json.path("title").asText());
    }

    @Test
    void quotesAndBracketsNoLongerProduceMalformedJson() throws Exception {
        // parse() runs readTree, which throws if the payload is not valid JSON.
        HttpEntity<?> entity = capturePush(() -> pushNotificationService.notifyLearningEvent(
                RECIPIENT, "push.learning.enrolled.title", "push.learning.enrolled.body",
                "Prayer \"101\""));

        assertEquals("您已报名《Prayer \"101\"》，开始学习吧！", parse(entity).path("body").asText());
    }

    @Test
    void learningPushOmitsTheAbsentConversationId() throws Exception {
        HttpEntity<?> entity = capturePush(() -> pushNotificationService.notifyLearningEvent(
                RECIPIENT, "push.learning.quizPassed.title", "push.learning.quizPassed.body",
                "90", "Prayer 101"));

        JsonNode data = parse(entity).path("data");
        assertFalse(data.has("conversationId"), "a null id must not ship as the string \"null\"");
        assertEquals("learning", data.path("conversationType").asText());
    }

    @Test
    void chatPushCarriesTheRecipientsUnreadTotalForTheAppIcon() throws Exception {
        when(conversationMuteRepository.findByConversationIdAndConversationType(42L, "private"))
                .thenReturn(List.of());
        when(unreadCountService.totalUnreadFor(RECIPIENT)).thenReturn(7L);

        HttpEntity<?> entity = capturePush(() -> pushNotificationService.sendPushNotification(
                List.of(RECIPIENT), pushMessages.literal("在吗？"),
                pushMessages.personName("伟", "张"), 42L, "private"));

        assertEquals(7, parse(entity).path("badge").asInt());
    }

    @Test
    void learningPushCarriesNoBadgeSoItCannotWipeTheUnreadCount() throws Exception {
        // Chat messages are the only thing the icon counts. An absent badge key
        // leaves whatever the OS is already showing untouched — sending 0 here
        // would clear a legitimate unread count.
        HttpEntity<?> entity = capturePush(() -> pushNotificationService.notifyLearningEvent(
                RECIPIENT, "push.learning.achievement.title", "push.learning.achievement.body",
                "Faithful Reader"));

        assertFalse(parse(entity).has("badge"), "learning pushes must not set a badge");
        verifyNoInteractions(unreadCountService);
    }

    /** Sends one chat message to a device of the given platform. */
    private HttpEntity<?> captureChatPush(String deviceType) {
        when(conversationMuteRepository.findByConversationIdAndConversationType(42L, "private"))
                .thenReturn(List.of());
        return capturePush(deviceType, () -> pushNotificationService.sendPushNotification(
                List.of(RECIPIENT), pushMessages.literal("在吗？"),
                pushMessages.personName("伟", "张"), 42L, "private"));
    }

    @Test
    void androidChatPushCollapsesPerConversationWithATag() throws Exception {
        // `tag` replaces the notification already on screen, so a burst in one
        // conversation stays a single row showing the newest message.
        JsonNode payload = parse(captureChatPush("android"));

        assertEquals("private-42", payload.path("tag").asText());
        // collapseId maps to FCM's collapse_key on Android: in-transit only, and
        // capped at four distinct keys per device, so it is deliberately omitted.
        assertFalse(payload.has("collapseId"), "Android must collapse via tag, not collapseId");
    }

    @Test
    void iosChatPushCollapsesPerConversationWithACollapseId() throws Exception {
        // iOS has no tag; apns-collapse-id is what replaces the displayed alert.
        JsonNode payload = parse(captureChatPush("ios"));

        assertEquals("private-42", payload.path("collapseId").asText());
        assertFalse(payload.has("tag"), "tag is Android-only and would be dead weight on iOS");
    }

    @Test
    void separateConversationsGetSeparateCollapseKeysSoTheyDoNotOverwriteEachOther() throws Exception {
        when(conversationMuteRepository.findByConversationIdAndConversationType(99L, "group"))
                .thenReturn(List.of());
        HttpEntity<?> entity = capturePush("android", () -> pushNotificationService.sendPushNotification(
                List.of(RECIPIENT), pushMessages.literal("hi"),
                pushMessages.personName("Wei", "Zhang"), 99L, "group"));

        assertEquals("group-99", parse(entity).path("tag").asText());
    }

    @Test
    void learningPushIsNeverCollapsedSoDistinctEventsAllStay() throws Exception {
        // Learning events reuse conversationId for course/quiz ids. Collapsing on
        // that would let an achievement silently replace a graded-quiz notice.
        JsonNode payload = parse(capturePush(() -> pushNotificationService.notifyLearningEvent(
                RECIPIENT, "push.learning.achievement.title", "push.learning.achievement.body",
                "Faithful Reader")));

        assertFalse(payload.has("tag"), "learning events are distinct and must not replace each other");
        assertFalse(payload.has("collapseId"), "learning events are distinct and must not replace each other");
    }

    @Test
    void androidPushNamesTheChannelTheAppConfigured() throws Exception {
        // Without channelId Android drops the notification on its own default
        // channel, ignoring the importance/vibration/light the app set up.
        assertEquals("default", parse(captureChatPush("android")).path("channelId").asText());
    }

    @Test
    void iosPushOmitsTheAndroidOnlyChannelId() throws Exception {
        assertFalse(parse(captureChatPush("ios")).has("channelId"));
    }
}
