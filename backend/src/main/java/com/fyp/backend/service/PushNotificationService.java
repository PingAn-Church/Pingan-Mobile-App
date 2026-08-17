
package com.fyp.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
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

    @Autowired
    private AdminAlertService adminAlertService;

    /**
     * Tags the admin "someone just registered" push. Shares the conversationType
     * field with chat and learning pushes; the app routes on it (see
     * NotificationContext) and it decides the icon badge below.
     */
    static final String NEW_MEMBER_TYPE = "new-member";

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
     * Tells every admin that someone has just finished registering.
     *
     * A new account can't chat, post or join anything until an admin verifies
     * it, so this is the one unsolicited alert the admin side needs: without it
     * a sign-up sits unnoticed until somebody happens to open the user list.
     *
     * The new member's name is rendered per recipient, so an admin reading the
     * app in Chinese sees it family-name-first just as they would in-app.
     * Best-effort: registration must never fail because a push did.
     */
    public void notifyAdminsOfNewMember(User newMember) {
        if (newMember == null) return;
        try {
            List<Long> admins = adminAlertService.alertableAdminIds();
            // Covers the seeded first admin registering through the normal flow.
            admins = admins.stream()
                    .filter(id -> !id.equals(newMember.getId()))
                    .collect(Collectors.toList());
            if (admins.isEmpty()) return;

            LocalizedText name = pushMessages.personName(newMember.getFirstName(), newMember.getLastName());
            LocalizedText body = language ->
                    pushMessages.get(language, "push.admin.newMember.body", name.render(language));

            sendPushNotification(admins, body, pushMessages.text("push.admin.newMember.title"),
                    null, NEW_MEMBER_TYPE);
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
        fanOut(recipientIds, message, title, conversationId, conversationType, null, true);
    }

    /**
     * The direct path: learning, quiz, achievement and new-member pushes, sent on
     * the calling thread to a handful of people.
     *
     * Deliberately does NOT filter on verification, unlike {@link #sendQueuedBatch}.
     * A learner does not have to be admin-verified to take a course, so gating this
     * would silently stop their quiz results ever reaching them. Anything routed
     * through the queue instead must be traffic only verified members should see.
     */
    private void fanOut(List<Long> recipientIds, LocalizedText message, LocalizedText title,
            Long conversationId, String conversationType, Long threadId, boolean respectMute) {
        List<Long> targets = respectMute
                ? filterMutedRecipients(recipientIds, conversationId, conversationType)
                : recipientIds;

        for (Long userId : targets) {
            List<PushToken> tokens = pushTokenRepository.findByUserId(userId);
            if (tokens == null || tokens.isEmpty()) continue;

            String language = userRepository.findLanguageById(userId).orElse(null);
            String localizedBody = message == null ? "" : message.render(language);
            String localizedTitle = title == null ? "" : title.render(language);

            // The app icon can only learn the count from the payload when the app
            // isn't running to count for itself. Resolved once per recipient, not
            // per device — every device of theirs shows the same number.
            Integer badge = badgeFor(userId, conversationId, conversationType);

            for (PushToken token : tokens) {
                // Only send notification if the token is active
                if (token.isActive()) {
                    sendPushToDevice(token.getToken(), localizedBody, localizedTitle, conversationId, conversationType,
                            threadId, badge, token.getDeviceType());
                }
            }
        }
    }

    /**
     * Sends one Rabbit fan-out chunk using bulk token/user reads and Expo's batch
     * request shape. A transport failure escapes so the listener retry policy can
     * redeliver this bounded chunk; individual rejected device tickets are logged
     * and do not replay successful recipients.
     */
    public void sendQueuedBatch(List<Long> recipientIds, LocalizedText message,
            LocalizedText title, Long conversationId, String conversationType,
            Long threadId, boolean respectMute) {
        if (recipientIds == null || recipientIds.isEmpty()) return;

        List<Long> targets = respectMute
                ? filterMutedRecipients(recipientIds, conversationId, conversationType)
                : recipientIds;
        if (targets.isEmpty()) return;

        Map<Long, User> users = new HashMap<>();
        userRepository.findAllById(targets).forEach(user -> users.put(user.getId(), user));

        Map<Long, List<PushToken>> tokensByUser = new HashMap<>();
        pushTokenRepository.findByUserIdIn(targets).stream()
                .filter(PushToken::isActive)
                .forEach(token -> tokensByUser
                        .computeIfAbsent(token.getUser().getId(), ignored -> new ArrayList<>())
                        .add(token));

        List<Map<String, Object>> payloads = new ArrayList<>();
        for (Long userId : targets) {
            User user = users.get(userId);
            List<PushToken> tokens = tokensByUser.getOrDefault(userId, List.of());
            if (!canReceiveQueuedSocialPush(user) || tokens.isEmpty()) continue;

            String language = user.getLanguage();
            String localizedBody = message == null ? "" : message.render(language);
            String localizedTitle = title == null ? "" : title.render(language);
            Integer badge = badgeFor(user, conversationId, conversationType);

            for (PushToken token : tokens) {
                payloads.add(buildPayload(token.getToken(), localizedBody, localizedTitle,
                        conversationId, conversationType, threadId, badge, token.getDeviceType()));
            }
        }

        for (int from = 0; from < payloads.size(); from += 100) {
            int to = Math.min(from + 100, payloads.size());
            sendPushBatch(payloads.subList(from, to));
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

    /**
     * The number the app icon should show once this push lands, or null to leave
     * whatever is already on the icon untouched.
     *
     * There is only one icon, so anything that badges has to send the whole
     * total. A new-member alert carrying just its own count would wipe the
     * recipient's unread messages off the icon, and vice versa — hence the sum.
     * Learning pushes deliberately send nothing at all.
     */
    private Integer badgeFor(Long userId, Long conversationId, String conversationType) {
        if (isChatConversation(conversationId, conversationType)) {
            return (int) (unreadCountService.totalUnreadFor(userId)
                    + adminAlertService.unseenNewMemberCount(userId));
        }
        if (NEW_MEMBER_TYPE.equals(conversationType)) {
            return (int) (unreadCountService.totalUnreadFor(userId)
                    + adminAlertService.unseenNewMemberCount(userId));
        }
        return null;
    }

    private Integer badgeFor(User user, Long conversationId, String conversationType) {
        if (user == null) return null;
        if (isChatConversation(conversationId, conversationType)
                || NEW_MEMBER_TYPE.equals(conversationType)) {
            return (int) (unreadCountService.totalUnreadFor(user.getId())
                    + adminAlertService.unseenNewMemberCountForUser(user));
        }
        return null;
    }

    /**
     * Chat and forum traffic is verified-only, so a queued batch drops anybody who
     * has since been un-verified, deactivated or deleted — their membership is on
     * its way out and they should not keep hearing about it. The direct path above
     * intentionally applies no such filter; see the note there before moving any
     * notification between the two.
     */
    private boolean canReceiveQueuedSocialPush(User user) {
        return user != null
                && user.isActive()
                && !user.isDeletedAccount()
                && user.isVerifiedUser();
    }

    private List<Long> filterMutedRecipients(List<Long> recipientIds, Long conversationId, String conversationType) {
        if (!isChatConversation(conversationId, conversationType)) {
            return recipientIds;
        }
        Set<Long> muted = new HashSet<>(conversationMuteRepository.findMutedUserIds(
                conversationId, conversationType, recipientIds));
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
            String conversationType, Long threadId, Integer badge, String deviceType) {
        Map<String, Object> payload = buildPayload(token, message, title, conversationId,
                conversationType, threadId, badge, deviceType);

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

    private Map<String, Object> buildPayload(String token, String message, String title,
            Long conversationId, String conversationType, Long threadId,
            Integer badge, String deviceType) {
        // conversationId is absent for learning and topic pushes; omit the key
        // rather than shipping the literal string "null" the concatenated payload
        // produced.
        Map<String, Object> data = new LinkedHashMap<>();
        if (conversationId != null) {
            data.put("conversationId", String.valueOf(conversationId));
        }
        if (conversationType != null) {
            data.put("conversationType", conversationType);
        }
        // Its own key, never conversationId; older builds treat any conversationId
        // as a chat route.
        if (threadId != null) {
            data.put("threadId", String.valueOf(threadId));
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

        return payload;
    }

    private void sendPushBatch(Collection<Map<String, Object>> payloads) {
        if (payloads == null || payloads.isEmpty()) return;
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        String response = restTemplate.postForObject(
                EXPO_PUSH_URL, new HttpEntity<>(payloads, headers), String.class);
        logBatchDeliveryProblems(response);
    }

    private void logBatchDeliveryProblems(String response) {
        if (response == null || response.isBlank()) return;
        try {
            JsonNode root = objectMapper.readTree(response);
            JsonNode data = root.path("data");
            if (!data.isArray()) return;
            for (JsonNode ticket : data) {
                if (!"ok".equals(ticket.path("status").asText())) {
                    System.err.println("❌ Expo batch ticket error: "
                            + ticket.path("message").asText() + " ("
                            + ticket.path("details").path("error").asText() + ")");
                }
            }
        } catch (Exception unparseable) {
            System.err.println("⚠️ Unreadable Expo batch response");
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
