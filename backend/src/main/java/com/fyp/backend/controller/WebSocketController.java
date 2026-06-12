package com.fyp.backend.controller;

import com.fyp.backend.dto.ConversationDto;
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
    public void updateDeliveryStatus(@Payload DeliveryStatusUpdateDto statusUpdateDto) {
        if (statusUpdateDto.getMessageId() == null || statusUpdateDto.getConversationId() == null) {
            LOGGER.warn("⚠️ Invalid delivery status update: Missing messageId or conversationId");
            return;
        }

        // One malformed key must not abort the remaining updates.
        for (Map.Entry<String, String> entry : statusUpdateDto.getDeliveryStatus().entrySet()) {
            final Long recipientId;
            try {
                recipientId = Long.parseLong(entry.getKey());
            } catch (NumberFormatException e) {
                LOGGER.warn("⚠️ Skipping delivery status with non-numeric recipient id: {}", entry.getKey());
                continue;
            }
            String status = entry.getValue();

            chatService.updateMessageStatus(statusUpdateDto.getMessageId(), recipientId, status);
        }

        // Fetch all participants using conversationType
        List<User> participants = chatService.getConversationParticipants(
                statusUpdateDto.getConversationId(),
                statusUpdateDto.getConversationType()
        );

        for (User participant : participants) {
            messagingTemplate.convertAndSendToUser(
                    participant.getId().toString(),
                    "/queue/delivery-status",
                    statusUpdateDto
            );
        }
    }

    @MessageMapping("/participantAdded")
    public void notifyParticipantAdded(ConversationDto updatedConversation) {
        if (updatedConversation == null || updatedConversation.getConversationId() == null) {
            LOGGER.error("❌ Invalid participant update received, missing conversationId.");
            return;
        }

        LOGGER.info("🔔 WebSocket: Notifying all members about participant addition in {}", updatedConversation.getConversationId());

        // Notify all existing participants about the participant update
        for (Long participantId : updatedConversation.getParticipants()) {
            messagingTemplate.convertAndSendToUser(
                    participantId.toString(), "/queue/participant-updates", updatedConversation
            );
        }

        // Notify the newly added participant separately about their new conversation
        Long newlyAddedParticipantId = updatedConversation.getParticipants().get(updatedConversation.getParticipants().size() - 1);
        messagingTemplate.convertAndSendToUser(
                newlyAddedParticipantId.toString(), "/queue/conversations", updatedConversation
        );
    }

    @MessageMapping("/user-ready")
    public void onUserReady(@Payload Map<String, String> payload) {
        String email = payload.get("email");
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
}
