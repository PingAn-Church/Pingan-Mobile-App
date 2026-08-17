package com.fyp.backend.controller;

import com.fyp.backend.dto.DeliveryStatusUpdateDto;
import com.fyp.backend.model.User;
import com.fyp.backend.mq.ManualMessageConsumer;
import com.fyp.backend.service.ChatService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.util.List;
import java.util.Map;

@Controller
public class WebSocketController {
    private static final Logger LOGGER = LoggerFactory.getLogger(WebSocketController.class);

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatService chatService;
    private final ManualMessageConsumer messageConsumer;

    @Autowired
    public WebSocketController(
            SimpMessagingTemplate messagingTemplate,
            ChatService chatService,
            ManualMessageConsumer messageConsumer
    ) {
        this.messagingTemplate = messagingTemplate;
        this.chatService = chatService;
        this.messageConsumer = messageConsumer;
    }

    /** Client-level keepalive; the inbound interceptor refreshes the Redis TTL. */
    @MessageMapping("/heartbeat")
    public void handleHeartbeat() {
        // No-op: routing the frame is enough.
    }

    @MessageMapping("/updateDeliveryStatus")
    public void updateDeliveryStatus(@Payload DeliveryStatusUpdateDto statusUpdateDto,
                                     StompHeaderAccessor accessor) {
        if (statusUpdateDto.getMessageId() == null || statusUpdateDto.getConversationId() == null) {
            LOGGER.warn("⚠️ Invalid delivery status update: Missing messageId or conversationId");
            return;
        }

        Long currentUserId = sessionUserId(accessor);
        if (currentUserId == null || statusUpdateDto.getDeliveryStatus() == null) {
            LOGGER.warn("⚠️ Delivery status update has no authenticated session user");
            return;
        }
        String status = statusUpdateDto.getDeliveryStatus().get(String.valueOf(currentUserId));
        if (!"READ".equals(status) && !"DELIVERED".equals(status)) {
            LOGGER.warn("⚠️ Rejected delivery status {} for user {}", status, currentUserId);
            return;
        }

        final String conversationType;
        try {
            conversationType = chatService.updateMessageStatusAuthorized(
                    statusUpdateDto.getMessageId(),
                    statusUpdateDto.getConversationId(),
                    currentUserId,
                    status);
        } catch (RuntimeException e) {
            LOGGER.warn("⚠️ Rejected delivery update from user {}: {}", currentUserId, e.getMessage());
            return;
        }

        // Null means nothing was recorded — a group, which keeps no receipts. There
        // is nothing to tell anyone, and fanning out anyway would cost one socket
        // write per member per message drawn.
        if (conversationType == null) {
            return;
        }

        statusUpdateDto.setConversationType(conversationType);
        statusUpdateDto.setDeliveryStatus(Map.of(String.valueOf(currentUserId), status));
        List<User> participants = chatService.getConversationParticipants(
                statusUpdateDto.getConversationId(), conversationType);

        for (User participant : participants) {
            messagingTemplate.convertAndSendToUser(
                    participant.getId().toString(),
                    "/queue/delivery-status",
                    statusUpdateDto
            );
        }
    }

    @MessageMapping("/user-ready")
    public void onUserReady(StompHeaderAccessor accessor) {
        String email = sessionEmail(accessor);
        if (email == null || email.isBlank()) {
            LOGGER.warn("❌ Received empty email in /user-ready");
            return;
        }

        try {
            messageConsumer.drainUserQueue(email); // deliver messages queued while offline
        } catch (Exception e) {
            LOGGER.error("❌ Failed to drain message queue for {}: {}", email, e.getMessage());
        }
    }

    private Long sessionUserId(StompHeaderAccessor accessor) {
        Object value = accessor.getSessionAttributes() == null
                ? null : accessor.getSessionAttributes().get("userId");
        return value instanceof Long ? (Long) value : null;
    }

    private String sessionEmail(StompHeaderAccessor accessor) {
        Object value = accessor.getSessionAttributes() == null
                ? null : accessor.getSessionAttributes().get("userEmail");
        return value instanceof String ? (String) value : null;
    }
}
