package com.fyp.backend.service;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.ModerationEvent;
import com.fyp.backend.model.PrivateConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.PrivateConversationRepository;

@ExtendWith(MockitoExtension.class)
class ModerationEventPublisherTest {

    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @InjectMocks private ModerationEventPublisher publisher;

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void defersGlobalEventUntilTransactionCommit() {
        ModerationEvent event = event("THREAD", 7L);
        TransactionSynchronizationManager.initSynchronization();

        publisher.publishAfterCommit(event);

        verify(messagingTemplate, never())
                .convertAndSend(ModerationEventPublisher.MODERATION_TOPIC, event);
        for (TransactionSynchronization synchronization
                : TransactionSynchronizationManager.getSynchronizations()) {
            synchronization.afterCommit();
        }
        verify(messagingTemplate)
                .convertAndSend(ModerationEventPublisher.MODERATION_TOPIC, event);
    }

    @Test
    void sendsGroupMessageEventOnlyToConversationTopic() {
        ModerationEvent event = event("MESSAGE", 8L);
        event.setConversationId(42L);
        event.setConversationType("group");

        publisher.publishAfterCommit(event);

        verify(messagingTemplate).convertAndSend("/topic/conversation-42", event);
        verify(messagingTemplate, never())
                .convertAndSend(ModerationEventPublisher.MODERATION_TOPIC, event);
    }

    @Test
    void sendsPrivateMessageEventOnlyToParticipantQueues() {
        User first = user(1L);
        User second = user(2L);
        PrivateConversation conversation = new PrivateConversation();
        conversation.setId(43L);
        conversation.setUserOne(first);
        conversation.setUserTwo(second);
        when(privateConversationRepository.findWithParticipantsById(43L))
                .thenReturn(Optional.of(conversation));

        ModerationEvent event = event("MESSAGE", 9L);
        event.setConversationId(43L);
        event.setConversationType("private");

        publisher.publishAfterCommit(event);

        verify(messagingTemplate).convertAndSend("/user/1/queue/moderation", event);
        verify(messagingTemplate).convertAndSend("/user/2/queue/moderation", event);
        verify(messagingTemplate, never())
                .convertAndSend(ModerationEventPublisher.MODERATION_TOPIC, event);
    }

    private ModerationEvent event(String contentType, Long contentId) {
        return ModerationEvent.builder()
                .contentType(contentType)
                .contentId(contentId)
                .state(ModerationEvent.STATE_PENDING)
                .build();
    }

    private User user(Long id) {
        User user = new User();
        user.setId(id);
        return user;
    }
}
