package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.User;
import com.fyp.backend.mq.MessagePublisher;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Proves the send fan-out never targets the sender: push notifications go to
 * the other participants only, and the sender's socket queue receives exactly
 * one echo of their own message.
 */
@ExtendWith(MockitoExtension.class)
class ChatPushNotificationTest {

    @Mock private MessageRepository messageRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private UserRepository userRepository;
    @Mock private MessageDeliveryStatusRepository deliveryStatusRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private OSSService ossService;
    @Mock private RedisService redisService;
    @Mock private MessagePublisher messagePublisher;
    @Mock private PushNotificationService pushNotificationService;
    @Mock private UserBlockService userBlockService;
    @Spy private ContentSanitizer contentSanitizer = new ContentSanitizer();

    @InjectMocks private ChatService chatService;

    private User user(long id) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        return user;
    }

    @Test
    void sendMessagePushesToOtherParticipantsOnly() {
        User sender = user(1L);
        GroupConversation conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setGroupName("Test Group");
        conversation.setParticipants(List.of(sender, user(2L), user(3L)));

        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(conversation));
        when(userRepository.findById(1L)).thenReturn(Optional.of(user(1L)));
        when(userRepository.findById(2L)).thenReturn(Optional.of(user(2L)));
        when(userRepository.findById(3L)).thenReturn(Optional.of(user(3L)));
        when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));
        when(redisService.isUserOnlineAnywhere(any())).thenReturn(true);

        MessageDto dto = new MessageDto();
        dto.setConversationId(42L);
        dto.setSenderId(1L);
        dto.setType("text");
        dto.setConversationType("group");
        dto.setContent("hello there");

        TransactionSynchronizationManager.initSynchronization();
        try {
            MessageDto sent = chatService.sendMessageAndBroadcast(dto, "group");
            assertEquals(List.of(2L, 3L), sent.getRecipientIds());

            for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
                sync.afterCommit();
            }
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        verify(pushNotificationService).sendPushNotification(
                List.of(2L, 3L), "hello there", "Test Group", 42L, "group");
        verify(messagingTemplate, times(1))
                .convertAndSend(eq("/user/1/queue/messages"), any(Object.class));
    }
}
