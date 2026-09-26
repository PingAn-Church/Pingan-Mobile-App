package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.User;
import com.fyp.backend.mq.FanoutPublisher;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class ChatMessageDeletionOrderingTest {

    @Mock private MessageRepository messageRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private UserRepository userRepository;
    @Mock private MessageDeliveryStatusRepository messageDeliveryStatusRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private OSSService ossService;
    @Mock private MediaReferenceService mediaReferenceService;
    @Mock private FanoutPublisher fanoutPublisher;
    @Mock private UserBlockService userBlockService;
    @Mock private ContentSanitizer contentSanitizer;
    @Mock private PushMessages pushMessages;
    @Mock private ConversationReadStateService conversationReadStateService;

    private ChatService chatService;

    private final AssistantAccountService assistantAccountService =
            org.mockito.Mockito.mock(AssistantAccountService.class);

    @BeforeEach
    void setUp() {
        OssCleanupService cleanupService = new OssCleanupService(ossService, mediaReferenceService);
        chatService = new ChatService(messageRepository, groupConversationRepository,
                privateConversationRepository, userRepository, messageDeliveryStatusRepository,
                messagingTemplate, cleanupService, fanoutPublisher,
                userBlockService, contentSanitizer, pushMessages,
                conversationReadStateService, assistantAccountService,
                org.mockito.Mockito.mock(com.fyp.backend.repository.EventRepository.class),
                org.mockito.Mockito.mock(MessageReactionService.class));
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void deletionBroadcastRunsBeforeOssReferenceCheck() {
        User sender = new User();
        sender.setId(7L);
        sender.setFirstName("Sender");
        sender.setLastName("User");

        GroupConversation conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setParticipants(List.of(sender));

        Message message = new Message();
        message.setId(9L);
        message.setSender(sender);
        message.setConversation(conversation);
        message.setConversationType("group");
        message.setType("image");
        message.setContent("https://cdn.example.com/conversations/42/u7_photo.jpg");
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        when(messageRepository.findById(9L)).thenReturn(Optional.of(message));

        chatService.deleteMessageAndBroadcast(9L);

        List<TransactionSynchronization> synchronizations =
                TransactionSynchronizationManager.getSynchronizations();
        assertEquals(2, synchronizations.size());
        synchronizations.forEach(TransactionSynchronization::afterCommit);

        InOrder order = inOrder(messagingTemplate, mediaReferenceService);
        order.verify(messagingTemplate).convertAndSend(
                org.mockito.ArgumentMatchers.eq("/topic/conversation-42"),
                org.mockito.ArgumentMatchers.any(com.fyp.backend.dto.MessageDto.class));
        order.verify(mediaReferenceService).isReferencedByUrl(message.getContent());
    }
}
