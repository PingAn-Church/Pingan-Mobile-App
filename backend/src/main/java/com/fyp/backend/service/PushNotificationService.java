
package com.fyp.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.model.ConversationMute;
import com.fyp.backend.model.PushToken;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PushNotificationService {

    @Autowired
    private PushTokenRepository pushTokenRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ConversationMuteRepository conversationMuteRepository;

    @Autowired
    private PushMessages pushMessages;

    @Autowired
    private UnreadCountService unreadCountService;

    private final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    // Reused across sends — RestTemplate is thread-safe once built, and a new one
    // per device meant a fresh converter/connection setup for every notification.
    private RestTemplate restTemplate = new RestTemplate();

    private final ObjectMapper objectMapper = new ObjectMapper();

    // Register a push token for a user logging in (set it active if not already)
    public PushToken registerPushTokenForLogin(Long userId, String token, String deviceType, String deviceId) {
        // Fetch the user based on userId
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Check if the token already exists for this user and deviceId
        Optional<PushToken> existingPushToken = pushTokenRepository.findByUserIdAndTokenAndDeviceId(userId, token, deviceId);

        System.out.println("EXISTS??" + existingPushToken.isPresent());

        if (existingPushToken.isPresent()) {
            PushToken pushToken = existingPushToken.get();
            // If the token is inactive, reactivate it
            if (!pushToken.isActive()) {
                pushToken.setActive(true);
                pushToken.setDeviceType(deviceType);  // Update device type if needed
                pushToken.setDeviceId(deviceId);  // Update deviceId if needed
                return pushTokenRepository.save(pushToken);
            }
            // If active, simply return the existing token
            return pushToken;
        }

        // If the token doesn't exist, create a new PushToken and set it active
        PushToken pushToken = new PushToken();
        pushToken.setUser(user);
        pushToken.setToken(token);
        pushToken.setDeviceType(deviceType);
        pushToken.setDeviceId(deviceId);  // Store the deviceId
        pushToken.setActive(true);  // Active after login

        return pushTokenRepository.save(pushToken);
    }

    // Deactivate a push token (e.g., for logging out or user preferences)
    public PushToken deactivatePushToken(Long userId, String token) {
        PushToken pushToken = pushTokenRepository.findByUserIdAndToken(userId, token)
                .orElseThrow(() -> new RuntimeException("Token not found"));

        pushToken.setActive(false);
        return pushTokenRepository.save(pushToken);
    }

    @Transactional
    public int deactivatePushTokensForDevice(String email, String deviceId) {
        return pushTokenRepository.deactivateByUserEmailAndDeviceId(email, deviceId);
    }

    // Unregister a push token (e.g., app uninstalled)
    public void unregisterPushToken(Long userId, String token) {
        pushTokenRepository.deleteByUserIdAndToken(userId, token);
    }

    // Send push notifications to all devices associated with the user
//    public void sendPushNotification(Long userId, String message) {
//        List<PushToken> tokens = pushTokenRepository.findByUserId(userId);
//
//        // Use a push notification service to send notifications to the tokens (e.g., Firebase, Expo)
//        for (PushToken pushToken : tokens) {
//            if (pushToken.isActive()) {
//                // Call your push notification service to send the message
//                // Example: sendToDevice(pushToken.getToken(), message);
//            }
//        }
//    }

//    // Send push notifications to all devices associated with the user

    /**
     * Sends a learning-related push (enrolment, quiz result, course completion,
     * achievement, goal) to a single user, reusing the Expo delivery path.
     * Titles and bodies are message-bundle keys, resolved into the recipient's
     * language. Best-effort: any delivery failure is swallowed so it never
     * breaks the learning flow that triggered it.
     */
    public void notifyLearningEvent(Long userId, String titleKey, String bodyKey, Object... bodyArgs) {
        if (userId == null) return;
        try {
            sendPushNotification(List.of(userId),
                    pushMessages.text(bodyKey, bodyArgs), pushMessages.text(titleKey),
                    null, "learning");
        } catch (Exception ignored) {
            // best-effort notification; never disrupt the originating action
        }
    }

    /**
     * Quiz-graded push that deep-links the learner to the quiz results screen.
     * The quiz id rides on the existing conversationId field, tagged with the
     * "quiz-graded" type so the app routes it to results rather than chat.
     */
    public void notifyQuizGraded(Long userId, Long quizId, String titleKey, String bodyKey, Object... bodyArgs) {
        if (userId == null) return;
        try {
            sendPushNotification(List.of(userId),
                    pushMessages.text(bodyKey, bodyArgs), pushMessages.text(titleKey),
                    quizId, "quiz-graded");
        } catch (Exception ignored) {
            // best-effort notification; never disrupt the originating action
        }
    }

    /**
     * Fans a push out to every active device of every recipient.
     *
     * The text arrives as a recipe rather than a finished string: one send can
     * reach people using different app languages, so each recipient's copy is
     * rendered against the language their device last reported.
     */
    public void sendPushNotification(List<Long> recipientIds, LocalizedText message, LocalizedText title, Long conversationId, String conversationType) {
        boolean isChat = isChatConversation(conversationId, conversationType);

        for (Long userId : filterMutedRecipients(recipientIds, conversationId, conversationType)) {
            List<PushToken> tokens = pushTokenRepository.findByUserId(userId);
            if (tokens == null || tokens.isEmpty()) continue;

            String language = userRepository.findLanguageById(userId).orElse(null);
            String localizedBody = message == null ? "" : message.render(language);
            String localizedTitle = title == null ? "" : title.render(language);

            // The app icon can only learn the count from the payload when the app
            // isn't running to count for itself. Resolved once per recipient, not
            // per device — every device of theirs shows the same number. Learning
            // events carry no badge (see sendPushToDevice).
            Integer badge = isChat ? (int) unreadCountService.totalUnreadFor(userId) : null;

            for (PushToken token : tokens) {
                // Only send notification if the token is active
                if (token.isActive()) {
                    sendPushToDevice(token.getToken(), localizedBody, localizedTitle, conversationId, conversationType,
                            badge, token.getDeviceType());
                }
            }
        }
    }

    /**
     * Drops recipients who muted this conversation. Only chat pushes are
     * filtered — learning/quiz pushes reuse conversationId for other ids and
     * must never be muted by a conversation setting.
     */
    /**
     * True only for real chat pushes. Learning events reuse conversationId to carry
     * unrelated ids (course, quiz), so the type has to be checked alongside it —
     * otherwise they would be muted, badged and collapsed as if they were messages.
     */
    private static boolean isChatConversation(Long conversationId, String conversationType) {
        return conversationId != null
                && ("private".equals(conversationType) || "group".equals(conversationType));
    }

    private List<Long> filterMutedRecipients(List<Long> recipientIds, Long conversationId, String conversationType) {
        if (!isChatConversation(conversationId, conversationType)) {
            return recipientIds;
        }
        Set<Long> muted = conversationMuteRepository
                .findByConversationIdAndConversationType(conversationId, conversationType)
                .stream()
                .map(ConversationMute::getUserId)
                .collect(Collectors.toSet());
        if (muted.isEmpty()) {
            return recipientIds;
        }
        return recipientIds.stream()
                .filter(id -> !muted.contains(id))
                .collect(Collectors.toList());
    }

    /**
     * Sends one push to one device via the Expo Push API.
     *
     * The payload is handed over as a Map rather than a hand-built JSON string.
     * A raw String body would select Spring's StringHttpMessageConverter, whose
     * default charset is ISO-8859-1: every Chinese character and emoji in the
     * title or body was replaced by '?' before the request left the JVM. Going
     * through Jackson sends UTF-8 and escapes the values, so a message holding a
     * quote, backslash or newline can no longer produce malformed JSON that Expo
     * rejects outright.
     *
     * A null badge is left off the payload entirely. Only chat pushes count
     * towards the app icon, and an absent badge tells the OS to leave whatever is
     * already there alone — a learning notification must not wipe someone's unread
     * message count.
     */
    private void sendPushToDevice(String token, String message, String title, Long conversationId,
            String conversationType, Integer badge, String deviceType) {
        // conversationId is absent for learning pushes; omit the key rather than
        // shipping the literal string "null" the concatenated payload produced.
        Map<String, Object> data = new LinkedHashMap<>();
        if (conversationId != null) {
            data.put("conversationId", String.valueOf(conversationId));
        }
        if (conversationType != null) {
            data.put("conversationType", conversationType);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("to", token);
        payload.put("title", title == null ? "" : title);
        payload.put("body", message == null ? "" : message);
        if (badge != null) {
            payload.put("badge", badge);
        }

        // Anything that isn't explicitly iOS is treated as Android: both keys below
        // are ignored by the other platform, so an unrecognised deviceType degrades
        // to today's behaviour rather than misrouting.
        boolean isAndroid = !"ios".equalsIgnoreCase(deviceType);

        // Android drops a remote notification onto its default channel unless the
        // payload names one, so the "default" channel the app creates at
        // registration (importance MAX, vibration pattern, light colour) was never
        // being applied. See registerForPushNotificationsAsync on the client.
        if (isAndroid) {
            payload.put("channelId", "default");
        }

        // Collapse per conversation: a burst of messages in one chat shows a single
        // notification carrying the newest, instead of one row per message.
        if (isChatConversation(conversationId, conversationType)) {
            String collapseKey = conversationType + "-" + conversationId;
            if (isAndroid) {
                // `tag` replaces what is already on screen. Deliberately not also
                // sending collapseId here: on Android that maps to FCM's
                // collapse_key, which only coalesces in transit and is capped at
                // four distinct keys per device — someone active in more
                // conversations than that could silently lose queued notifications
                // while offline.
                payload.put("tag", collapseKey);
            } else {
                // iOS has no tag; collapseId (apns-collapse-id) both coalesces in
                // transit and replaces the notification already displayed.
                payload.put("collapseId", collapseKey);
            }
        }

        payload.put("data", data);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON); // UTF-8 by definition

        try {
            String response = restTemplate.postForObject(
                    EXPO_PUSH_URL, new HttpEntity<>(payload, headers), String.class);
            logDeliveryProblems(token, response);
        } catch (Exception e) {
            System.err.println("❌ Expo push failed for " + maskToken(token) + ": " + e.getMessage());
        }
    }

    /**
     * Expo answers 200 even when it refuses a ticket (unregistered device, bad
     * credentials, throttling), so the body has to be read. Naming the reason
     * beats the silent stack trace this used to swallow.
     */
    private void logDeliveryProblems(String token, String response) {
        if (response == null || response.isBlank()) return;
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode errors = root.path("errors");
            if (errors.isArray() && !errors.isEmpty()) {
                System.err.println("❌ Expo rejected push for " + maskToken(token) + ": " + errors);
                return;
            }
            JsonNode ticket = root.path("data");
            if (ticket.isObject() && !"ok".equals(ticket.path("status").asText())) {
                System.err.println("❌ Expo ticket error for " + maskToken(token) + ": "
                        + ticket.path("message").asText()
                        + " (" + ticket.path("details").path("error").asText() + ")");
            }
        } catch (Exception unparseable) {
            System.err.println("⚠️ Unreadable Expo response for " + maskToken(token) + ": " + response);
        }
    }

    /** A push token identifies a device — keep the whole thing out of the logs. */
    private String maskToken(String token) {
        if (token == null || token.length() <= 8) return "token:***";
        return "token:…" + token.substring(token.length() - 8);
    }

}
