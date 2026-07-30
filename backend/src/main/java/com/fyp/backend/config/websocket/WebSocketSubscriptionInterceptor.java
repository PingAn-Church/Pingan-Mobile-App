package com.fyp.backend.config.websocket;

import com.fyp.backend.model.User;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Authorizes STOMP SUBSCRIBE frames. The simple broker treats /user/{id}/queue/*
 * and /topic/conversation-{id} as plain destinations, so without this check any
 * connected client could subscribe to another user's queues or a conversation it
 * does not belong to and read private messages.
 *
 * Allowed:
 *  - /user/queue/status                     (global presence broadcast, by design)
 *  - /user/{ownUserId}/queue/*              (own per-user queues only)
 *  - /topic/conversation-{id}               (participants only)
 * Everything else is dropped.
 */
@Component
public class WebSocketSubscriptionInterceptor implements ChannelInterceptor {

    private static final Logger LOGGER = LoggerFactory.getLogger(WebSocketSubscriptionInterceptor.class);

    private static final Pattern USER_QUEUE = Pattern.compile("^/user/(\\d+)/queue/[\\w-]+$");
    private static final Pattern CONVERSATION_TOPIC = Pattern.compile("^/topic/conversation-(\\d+)$");
    private static final String STATUS_BROADCAST = "/user/queue/status";
    private static final String MODERATION_TOPIC = "/topic/content-moderation";
    private static final java.util.Set<String> ALLOWED_SEND_DESTINATIONS = java.util.Set.of(
            "/app/heartbeat",
            "/app/updateDeliveryStatus",
            "/app/user-ready");

    private final UserRepository userRepository;
    private final GroupConversationRepository groupConversationRepository;
    private final PrivateConversationRepository privateConversationRepository;

    public WebSocketSubscriptionInterceptor(UserRepository userRepository,
                                            GroupConversationRepository groupConversationRepository,
                                            PrivateConversationRepository privateConversationRepository) {
        this.userRepository = userRepository;
        this.groupConversationRepository = groupConversationRepository;
        this.privateConversationRepository = privateConversationRepository;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        if (StompCommand.SEND.equals(accessor.getCommand())) {
            String destination = accessor.getDestination();
            String email = sessionAttribute(accessor, "userEmail");
            if (email != null && ALLOWED_SEND_DESTINATIONS.contains(destination)) {
                return message;
            }
            LOGGER.warn("⛔ Blocked WebSocket send to {} by {}", destination, email);
            return null;
        }
        if (!StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            return message;
        }

        String destination = accessor.getDestination();
        String email = sessionAttribute(accessor, "userEmail");

        if (isAllowed(destination, email, accessor)) {
            return message;
        }

        LOGGER.warn("⛔ Blocked WebSocket subscription to {} by {}", destination, email);
        return null; // drop the SUBSCRIBE frame
    }

    private boolean isAllowed(String destination, String email, StompHeaderAccessor accessor) {
        if (destination == null || email == null) {
            return false;
        }
        if (STATUS_BROADCAST.equals(destination)) {
            return true;
        }

        Long userId = resolveUserId(email, accessor);
        if (userId == null) {
            return false;
        }
        if (MODERATION_TOPIC.equals(destination)) {
            return true;
        }

        Matcher userQueue = USER_QUEUE.matcher(destination);
        if (userQueue.matches()) {
            return userId.equals(Long.valueOf(userQueue.group(1)));
        }

        Matcher conversation = CONVERSATION_TOPIC.matcher(destination);
        if (conversation.matches()) {
            Long conversationId = Long.valueOf(conversation.group(1));
            return groupConversationRepository.isParticipant(conversationId, userId)
                    || privateConversationRepository.isParticipant(conversationId, userId);
        }

        return false;
    }

    /** Resolve and cache the user id on the WS session to avoid a DB hit per SUBSCRIBE. */
    private Long resolveUserId(String email, StompHeaderAccessor accessor) {
        Map<String, Object> attributes = accessor.getSessionAttributes();
        Object cached = attributes != null ? attributes.get("userId") : null;
        if (cached instanceof Long) {
            return (Long) cached;
        }

        Long userId = userRepository.findByEmail(email).map(User::getId).orElse(null);
        if (userId != null && attributes != null) {
            attributes.put("userId", userId);
        }
        return userId;
    }

    private String sessionAttribute(StompHeaderAccessor accessor, String key) {
        Map<String, Object> attributes = accessor.getSessionAttributes();
        Object value = attributes != null ? attributes.get(key) : null;
        return value instanceof String ? (String) value : null;
    }
}
