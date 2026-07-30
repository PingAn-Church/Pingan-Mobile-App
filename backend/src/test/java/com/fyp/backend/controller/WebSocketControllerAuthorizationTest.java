package com.fyp.backend.controller;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;

import com.fyp.backend.dto.DeliveryStatusUpdateDto;
import com.fyp.backend.model.User;
import com.fyp.backend.mq.ManualMessageConsumer;
import com.fyp.backend.service.ChatService;

@ExtendWith(MockitoExtension.class)
class WebSocketControllerAuthorizationTest {

    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private ChatService chatService;
    @Mock private ManualMessageConsumer messageConsumer;
    @InjectMocks private WebSocketController controller;

    @Test
    void deliveryReceiptCannotUpdateAnotherUsersStatus() {
        DeliveryStatusUpdateDto update = update(Map.of("999", "READ"));

        controller.updateDeliveryStatus(update, accessor(7L, "user@example.com"));

        verify(chatService, never()).updateMessageStatusAuthorized(
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void deliveryReceiptUsesAuthenticatedSessionUser() {
        DeliveryStatusUpdateDto update = update(Map.of("7", "READ", "999", "READ"));
        User participant = new User();
        participant.setId(8L);
        when(chatService.updateMessageStatusAuthorized(10L, 42L, 7L, "READ"))
                .thenReturn("group");
        when(chatService.getConversationParticipants(42L, "group"))
                .thenReturn(List.of(participant));

        controller.updateDeliveryStatus(update, accessor(7L, "user@example.com"));

        verify(chatService).updateMessageStatusAuthorized(10L, 42L, 7L, "READ");
        verify(messagingTemplate).convertAndSendToUser(
                "8", "/queue/delivery-status", update);
    }

    @Test
    void userReadyDrainsOnlyAuthenticatedSessionsQueue() {
        controller.onUserReady(accessor(7L, "user@example.com"));

        verify(messageConsumer).drainUserQueue("user@example.com");
    }

    private DeliveryStatusUpdateDto update(Map<String, String> statuses) {
        DeliveryStatusUpdateDto update = new DeliveryStatusUpdateDto();
        update.setMessageId(10L);
        update.setConversationId(42L);
        update.setDeliveryStatus(statuses);
        return update;
    }

    private StompHeaderAccessor accessor(Long userId, String email) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND);
        HashMap<String, Object> attributes = new HashMap<>();
        attributes.put("userId", userId);
        attributes.put("userEmail", email);
        accessor.setSessionAttributes(attributes);
        return accessor;
    }
}
