package com.fyp.backend.controller;

import com.fyp.backend.dto.ConversationDto;
import com.fyp.backend.dto.DeliveryStatusUpdateDto;
import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.Conversation;
import com.fyp.backend.model.User;
import com.fyp.backend.mq.ManualMessageConsumer;
import com.fyp.backend.service.ChatService;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.service.ConversationService;
import com.fyp.backend.service.RedisService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.SubscribeMapping;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Controller
public class WebSocketController {
    private static final Logger LOGGER = LoggerFactory.getLogger(WebSocketController.class);
    private final RedisService redisService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ConversationService conversationService;
    private final ChatService chatService;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private ManualMessageConsumer messageConsumer;


    @Autowired
    public WebSocketController(
            RedisService redisService,
            SimpMessagingTemplate messagingTemplate,
            ConversationService conversationService,
            ChatService chatService,
            MessageRepository messageRepository,
            UserRepository userRepository,
            ManualMessageConsumer messageConsumer
    ) {
        this.redisService = redisService;
        this.messagingTemplate = messagingTemplate;
        this.conversationService = conversationService;
        this.chatService = chatService;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.messageConsumer = messageConsumer;
    }

//    @MessageMapping("/sendMessage")
//    public void sendMessage(@Payload MessageDto messageDto) {
//        try {
//            LOGGER.info("📨 Received Message: {}", messageDto.getContent());
//
//            // ✅ No database storage here - only broadcasting
//            String destination = "/topic/conversation-" + messageDto.getConversationId();
//            messagingTemplate.convertAndSend(destination, messageDto);
//
//            LOGGER.info("✅ Message sent to {}", destination);
//        } catch (Exception e) {
//            LOGGER.error("❌ Error processing message: {}", e.getMessage());
//        }
//    }

//    @MessageMapping("/sendPrivateMessage")
//    public void sendPrivateMessage(@Payload MessageDto messageDto) {
//        LOGGER.info("📩 Broadcasting Private Message: {}", messageDto.getMessageId());
//
//        // ✅ Send message to both sender and recipient
//        for (Long recipientId : messageDto.getRecipientIds()) {
//            messagingTemplate.convertAndSendToUser(recipientId.toString(), "/queue/messages", messageDto);
//            LOGGER.info("✅ Private Message Sent to User {}", recipientId);
//        }
//
//        // ✅ Also send the message back to the sender to update their chat UI
//        messagingTemplate.convertAndSendToUser(messageDto.getSenderId().toString(), "/queue/messages", messageDto);
//        LOGGER.info("✅ Private Message Sent to Sender {}", messageDto.getSenderId());
//    }



//    @MessageMapping("/sendGroupMessage")
//    public void sendGroupMessage(@Payload MessageDto messageDto) {
//        LOGGER.info("📩 Broadcasting Group Message: {}", messageDto.getMessageId());
//
//        // ✅ Broadcast to all group members
//        messagingTemplate.convertAndSend("/topic/conversation-" + messageDto.getConversationId(), messageDto);
//        LOGGER.info("✅ Group Message Broadcasted to Conversation {}", messageDto.getConversationId());
//    }
//
//    @MessageMapping("/editPrivateMessage")
//    public void editPrivateMessage(@Payload MessageDto messageDto) {
//        try {
//            LOGGER.info("✏️ Editing Private Message: {}", messageDto.getMessageId());
//
//            // ✅ Mark as edited
//            messageDto.setEdited(true);
//
//            // ✅ Send update to ALL users in the conversation
//            for (Long recipientId : messageDto.getRecipientIds()) {
//                messagingTemplate.convertAndSendToUser(recipientId.toString(), "/queue/messages", messageDto);
//                LOGGER.info("✅ Private Message Edit Sent to User {}", recipientId);
//            }
//
//            // ✅ Also send the update back to the sender
//            messagingTemplate.convertAndSendToUser(messageDto.getSenderId().toString(), "/queue/messages", messageDto);
//            LOGGER.info("✅ Private Message Edit Sent to Sender {}", messageDto.getSenderId());
//
//        } catch (Exception e) {
//            LOGGER.error("❌ Error editing private message: {}", e.getMessage());
//        }
//    }


//    @MessageMapping("/editGroupMessage")
//    public void editGroupMessage(@Payload MessageDto messageDto) {
//        try {
//            LOGGER.info("✏️ Editing Group Message: {}", messageDto.getMessageId());
//
//            // ✅ Mark as edited
//            messageDto.setEdited(true);
//
//            // ✅ Broadcast to the entire group chat
//            messagingTemplate.convertAndSend("/topic/conversation-" + messageDto.getConversationId(), messageDto);
//            LOGGER.info("✅ Group Message Edited and Broadcasted");
//        } catch (Exception e) {
//            LOGGER.error("❌ Error editing group message: {}", e.getMessage());
//        }
//    }
//
//    @MessageMapping("/deletePrivateMessage")
//    public void deletePrivateMessage(@Payload MessageDto messageDto) {
//        try {
//            LOGGER.info("🗑 Deleting Private Message: {}", messageDto.getMessageId());
//
//            // ✅ Mark as deleted
//            messageDto.setDeleted(true);
//
//            // ✅ Notify ALL recipients about the deletion
//            for (Long recipientId : messageDto.getRecipientIds()) {
//                messagingTemplate.convertAndSendToUser(recipientId.toString(), "/queue/messages", messageDto);
//                LOGGER.info("✅ Private Message Deletion Sent to User {}", recipientId);
//            }
//
//            // ✅ Also notify the sender about the deletion
//            messagingTemplate.convertAndSendToUser(messageDto.getSenderId().toString(), "/queue/messages", messageDto);
//            LOGGER.info("✅ Private Message Deletion Sent to Sender {}", messageDto.getSenderId());
//
//        } catch (Exception e) {
//            LOGGER.error("❌ Error deleting private message: {}", e.getMessage());
//        }
//    }
//
//    @MessageMapping("/deleteGroupMessage")
//    public void deleteGroupMessage(@Payload MessageDto messageDto) {
//        try {
//            LOGGER.info("🗑 Deleting Group Message: {}", messageDto.getMessageId());
//
//            // ✅ Mark as deleted
//            messageDto.setDeleted(true);
//
//            // ✅ Broadcast delete event
//            messagingTemplate.convertAndSend("/topic/conversation-" + messageDto.getConversationId(), messageDto);
//            LOGGER.info("✅ Group Message Deletion Broadcasted");
//        } catch (Exception e) {
//            LOGGER.error("❌ Error deleting group message: {}", e.getMessage());
//        }
//    }

    @MessageMapping("/heartbeat")
    public void handleHeartbeat() {
        LOGGER.info("✅ Received WebSocket heartbeat from client");
    }

    @MessageMapping("/updateDeliveryStatus")
    public void updateDeliveryStatus(@Payload DeliveryStatusUpdateDto statusUpdateDto) {
        LOGGER.info("📬 Received Delivery Status Update for Message ID: {}", statusUpdateDto.getMessageId());

        if (statusUpdateDto.getMessageId() == null || statusUpdateDto.getConversationId() == null) {
            LOGGER.warn("⚠️ Invalid delivery status update: Missing messageId or conversationId");
            return;
        }

        // ✅ Correctly iterate over deliveryStatus map to update all recipients
        for (Map.Entry<String, String> entry : statusUpdateDto.getDeliveryStatus().entrySet()) {
            Long recipientId = Long.parseLong(entry.getKey());
            String status = entry.getValue();

            LOGGER.info("✅ Updating delivery status: messageId={}, recipientId={}, status={}",
                    statusUpdateDto.getMessageId(), recipientId, status);

            chatService.updateMessageStatus(statusUpdateDto.getMessageId(), recipientId, status);
        }

        // Fetch all participants using conversationType
        List<User> participants = chatService.getConversationParticipants(
                statusUpdateDto.getConversationId(),
                statusUpdateDto.getConversationType()
        );

        for (User participant : participants) {
            LOGGER.info("📡 Sending Status Update to User {}", participant.getId());
            messagingTemplate.convertAndSendToUser(
                    participant.getId().toString(),
                    "/queue/delivery-status",
                    statusUpdateDto
            );
        }
    }


    /**
     * ✅ WebSocket Broadcast: Notify users about new conversation
     */
//    @MessageMapping("/notifyNewConversation")
//    public void notifyNewConversation(ConversationDto conversationDto) {
//        if ("group".equals(conversationDto.getConversationType())) {
//            // ✅ Group chat messages go to the topic (all participants receive it)
//            messagingTemplate.convertAndSend(
//                    "/topic/conversation-" + conversationDto.getConversationId(),
//                    conversationDto
//            );
//        } else {
//            // ✅ Private chat messages go to each user’s queue
//            for (Long participantId : conversationDto.getParticipants()) {
//                messagingTemplate.convertAndSendToUser(
//                        participantId.toString(), "/queue/conversations", conversationDto
//                );
//            }
//        }
//    }
//    @MessageMapping("/notifyNewConversation")
//    public void notifyNewConversation(ConversationDto conversationDto) {
//        for (Long participantId : conversationDto.getParticipants()) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(), "/queue/conversations", conversationDto
//            );
//        }
//    }

//    @MessageMapping("/participantAdded")
//    public void notifyParticipantAdded(ConversationDto updatedConversation) {
//        if (updatedConversation == null || updatedConversation.getConversationId() == null) {
//            LOGGER.error("❌ Invalid participant update received, missing conversationId.");
//            return;
//        }
//
//        LOGGER.info("🔔 WebSocket: Notifying all members about participant addition in {}", updatedConversation.getConversationId());
//
//        for (Long participantId : updatedConversation.getParticipants()) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(), "/queue/participant-updates", updatedConversation
//            );
//        }
//    }

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

        LOGGER.info("📡 WebSocket: Sent new conversation update to participant {}", newlyAddedParticipantId);
    }


//    @MessageMapping("/participantRemoved")
//    public void notifyParticipantRemoved(@Payload ConversationDto updatedConversation) {
//        if (updatedConversation == null || updatedConversation.getConversationId() == null) {
//            LOGGER.error("❌ Invalid participant removal update received, missing conversationId.");
//            return;
//        }
//
//        LOGGER.info("🔔 WebSocket: Notifying all members about participant removal in {}", updatedConversation.getConversationId());
//
//        for (Long participantId : updatedConversation.getParticipants()) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(), "/queue/participant-updates", updatedConversation
//            );
//        }
//    }

//    @MessageMapping("/participantRemoved")
//    public void notifyParticipantRemoved(@Payload Map<String, Object> payload) {
//        Long conversationId = ((Number) payload.get("conversationId")).longValue();
//        List<Long> participants = (List<Long>) payload.get("participants");
//        Long removedParticipantId = ((Number) payload.get("removedParticipantId")).longValue();
//
//        if (conversationId == null || removedParticipantId == null) {
//            LOGGER.error("❌ Invalid participant removal update received.");
//            return;
//        }
//
//        LOGGER.info("🔔 WebSocket: Notifying all members about participant removal in {}", conversationId);
//
//        // ✅ Notify all **remaining** participants
//        for (Long participantId : participants) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(), "/queue/participant-updates", payload
//            );
//        }
//
//        // ✅ Notify the removed participant to remove the group from their chat list
//        messagingTemplate.convertAndSendToUser(
//                removedParticipantId.toString(), "/queue/conversations", null // Notify them to remove the chat
//        );
//
//        LOGGER.info("📡 WebSocket: Removed participant {} notified", removedParticipantId);
//    }

//    @MessageMapping("/participantRemoved")
//    public void notifyParticipantRemoved(@Payload Map<String, Object> payload) {
//        Object conversationIdObj = payload.get("conversationId");
//        Object removedParticipantIdObj = payload.get("removedParticipantId");
//
//        if (conversationIdObj == null || removedParticipantIdObj == null) {
//            LOGGER.error("❌ Invalid participant removal update received: missing required fields.");
//            return;
//        }
//
//        Long conversationId = (conversationIdObj instanceof Integer)
//                ? ((Integer) conversationIdObj).longValue()
//                : (Long) conversationIdObj;
//
//        Long removedParticipantId = (removedParticipantIdObj instanceof Integer)
//                ? ((Integer) removedParticipantIdObj).longValue()
//                : (Long) removedParticipantIdObj;
//
//        List<Long> participants = ((List<?>) payload.get("participants")).stream()
//                .map(participant -> (participant instanceof Integer) ? ((Integer) participant).longValue() : (Long) participant)
//                .toList();
//
//        LOGGER.info("🔔 WebSocket: Notifying all members about participant removal in {}", conversationId);
//
//        // ✅ Notify all remaining participants
//        for (Long participantId : participants) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(), "/queue/participant-updates", payload
//            );
//        }
//
//        // ✅ Notify the removed participant to remove the chat from their list
//        messagingTemplate.convertAndSendToUser(
//                removedParticipantId.toString(), "/queue/conversations", null
//        );
//
//        LOGGER.info("📡 WebSocket: Removed participant {} notified", removedParticipantId);
//    }

//    @MessageMapping("/participantRemoved")
//    public void notifyParticipantRemoved(@Payload Map<String, Object> payload) {
//        if (payload == null) {
//            LOGGER.error("❌ Received null payload for participant removal.");
//            return;
//        }
//
//        Object conversationIdObj = payload.get("conversationId");
//        Object removedParticipantIdObj = payload.get("removedParticipantId");
//        Object participantsObj = payload.get("participants");
//
//        if (conversationIdObj == null || removedParticipantIdObj == null || participantsObj == null) {
//            LOGGER.error("❌ Invalid participant removal update received: missing required fields.");
//            return;
//        }
//
//        Long conversationId = (conversationIdObj instanceof Integer)
//                ? ((Integer) conversationIdObj).longValue()
//                : (Long) conversationIdObj;
//
//        Long removedParticipantId = (removedParticipantIdObj instanceof Integer)
//                ? ((Integer) removedParticipantIdObj).longValue()
//                : (Long) removedParticipantIdObj;
//
//        List<Long> participants;
//        try {
//            participants = ((List<?>) participantsObj).stream()
//                    .map(participant -> (participant instanceof Integer) ? ((Integer) participant).longValue() : (Long) participant)
//                    .toList();
//        } catch (Exception e) {
//            LOGGER.error("❌ Failed to process participants list", e);
//            return;
//        }
//
//        LOGGER.info("🔔 WebSocket: Notifying all members about participant removal in {}", conversationId);
//
//        // ✅ Notify all remaining participants
//        for (Long participantId : participants) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(), "/queue/participant-updates", payload
//            );
//        }
//
//        // ✅ Notify the removed participant to remove the chat from their list
//        messagingTemplate.convertAndSendToUser(
//                removedParticipantId.toString(), "/queue/conversations", null
//        );
//
//        LOGGER.info("📡 WebSocket: Removed participant {} notified", removedParticipantId);
//    }

//    @MessageMapping("/participantRemoved")
//    public void notifyParticipantRemoved(@Payload(required = false) Map<String, Object> payload) {
//        if (payload == null) {
//            LOGGER.error("❌ Received null payload for participant removal.");
//            return;
//        }
//
//        Object conversationIdObj = payload.get("conversationId");
//        Object removedParticipantIdObj = payload.get("removedParticipantId");
//        Object participantsObj = payload.get("participants");
//
//        if (conversationIdObj == null || removedParticipantIdObj == null || participantsObj == null) {
//            LOGGER.error("❌ Invalid participant removal update received: missing required fields.");
//            return;
//        }
//
//        Long conversationId = (conversationIdObj instanceof Integer)
//                ? ((Integer) conversationIdObj).longValue()
//                : (Long) conversationIdObj;
//
//        Long removedParticipantId = (removedParticipantIdObj instanceof Integer)
//                ? ((Integer) removedParticipantIdObj).longValue()
//                : (Long) removedParticipantIdObj;
//
//        List<Long> participants;
//        try {
//            participants = ((List<?>) participantsObj).stream()
//                    .map(participant -> (participant instanceof Integer) ? ((Integer) participant).longValue() : (Long) participant)
//                    .toList();
//        } catch (Exception e) {
//            LOGGER.error("❌ Failed to process participants list", e);
//            return;
//        }
//
//        LOGGER.info("🔔 WebSocket: Notifying all members about participant removal in {}", conversationId);
//
//        // ✅ Notify all remaining participants
//        for (Long participantId : participants) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(), "/queue/participant-updates", payload
//            );
//        }
//
//        // ✅ Notify the removed participant to remove the chat from their list
//        messagingTemplate.convertAndSendToUser(
//                removedParticipantId.toString(), "/queue/conversations", new HashMap<>()
//        );
//
//
//        LOGGER.info("📡 WebSocket: Removed participant {} notified", removedParticipantId);
//    }

//    @MessageMapping("/participantRemoved")
//    public void notifyParticipantRemoved(@Payload(required = false) Map<String, Object> payload) {
//        if (payload == null) {
//            LOGGER.error("❌ Received null payload for participant removal.");
//            return;
//        }
//
//        Object conversationIdObj = payload.get("conversationId");
//        Object removedParticipantIdObj = payload.get("removedParticipantId");
//        Object participantsObj = payload.get("participants");
//
//        if (conversationIdObj == null || removedParticipantIdObj == null || participantsObj == null) {
//            LOGGER.error("❌ Invalid participant removal update received: missing required fields.");
//            return;
//        }
//
//        Long conversationId = (conversationIdObj instanceof Integer)
//                ? ((Integer) conversationIdObj).longValue()
//                : (Long) conversationIdObj;
//
//        Long removedParticipantId = (removedParticipantIdObj instanceof Integer)
//                ? ((Integer) removedParticipantIdObj).longValue()
//                : (Long) removedParticipantIdObj;
//
//        List<Long> participants;
//        try {
//            participants = ((List<?>) participantsObj).stream()
//                    .map(participant -> (participant instanceof Integer) ? ((Integer) participant).longValue() : (Long) participant)
//                    .toList();
//        } catch (Exception e) {
//            LOGGER.error("❌ Failed to process participants list", e);
//            return;
//        }
//
//        LOGGER.info("🔔 WebSocket: Notifying all members about participant removal in {}", conversationId);
//
//        // ✅ Notify all remaining participants
//        for (Long participantId : participants) {
//            messagingTemplate.convertAndSendToUser(
//                    participantId.toString(), "/queue/participant-updates", payload
//            );
//        }
//
//        // ✅ Notify the removed participant to remove the chat from their list
//        Map<String, Object> removalNotice = new HashMap<>();
//        removalNotice.put("conversationId", conversationId);
//        removalNotice.put("removed", true);  // Explicitly state removal
//
//        messagingTemplate.convertAndSendToUser(
//                removedParticipantId.toString(), "/queue/conversations", removalNotice
//        );
//
//        LOGGER.info("📡 WebSocket: Removed participant {} notified", removedParticipantId);
//    }






//    @EventListener
//    public void handleWebSocketConnect(SessionConnectEvent event) {
//        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
//        String userId = (String) accessor.getSessionAttributes().get("userId"); // ✅ Use userId instead of userEmail
//
//        if (userId != null) {
//            redisService.setUserOnline(userId);  // ✅ Track online users by userId
//            LOGGER.info("✅ User connected: {}", userId);
//
//            // Fetch user's conversations and notify their group chats
//            List<ConversationDto> userConversations = conversationService.getConversationsByUserId(Long.parseLong(userId));
//            for (ConversationDto conversation : userConversations) {
//                String destination = "/topic/conversation-" + conversation.getConversationId();
//                messagingTemplate.convertAndSend(destination, "User " + userId + " joined");
//            }
//
//            // Notify users about online status
//            messagingTemplate.convertAndSend("/user/queue/status",
//                    "{\"user\": \"" + userId + "\", \"status\": \"online\"}");
//        }
//    }
//
//    @EventListener
//    public void handleWebSocketDisconnect(SessionDisconnectEvent event) {
//        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
//        String userId = (String) accessor.getSessionAttributes().get("userId"); // ✅ Extract userId
//
//        if (userId != null) {
//            redisService.setUserOffline(userId);
//            LOGGER.info("❌ User disconnected: {}", userId);
//
//            // Notify all group chats
//            List<ConversationDto> userConversations = conversationService.getConversationsByUserId(Long.parseLong(userId));
//            for (ConversationDto conversation : userConversations) {
//                String destination = "/topic/conversation-" + conversation.getConversationId();
//                messagingTemplate.convertAndSend(destination, "User " + userId + " left");
//            }
//
//            // Notify users about offline status
//            messagingTemplate.convertAndSend("/user/queue/status",
//                    "{\"user\": \"" + userId + "\", \"status\": \"offline\"}");
//        }
//    }

    @MessageMapping("/user-ready")
    public void onUserReady(@Payload Map<String, String> payload) {
        String email = payload.get("email");
        if (email == null || email.isBlank()) {
            LOGGER.warn("❌ Received empty email in /user-ready");
            return;
        }

        LOGGER.info("✅ Received user-ready signal from frontend: {}", email);

        try {
            messageConsumer.drainUserQueue(email); // 👈 Trigger queue drain
        } catch (Exception e) {
            LOGGER.error("❌ Failed to drain message queue for {}: {}", email, e.getMessage());
        }
    }


}
