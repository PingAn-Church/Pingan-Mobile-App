package com.fyp.backend.service;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.ModerationEvent;
import com.fyp.backend.repository.PrivateConversationRepository;

@Service
public class ModerationEventPublisher {
    public static final String MODERATION_TOPIC = "/topic/content-moderation";

    private final SimpMessagingTemplate messagingTemplate;
    private final PrivateConversationRepository privateConversationRepository;

    public ModerationEventPublisher(SimpMessagingTemplate messagingTemplate,
            PrivateConversationRepository privateConversationRepository) {
        this.messagingTemplate = messagingTemplate;
        this.privateConversationRepository = privateConversationRepository;
    }

    public void publishAfterCommit(ModerationEvent event) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publish(event);
                }
            });
            return;
        }
        publish(event);
    }

    private void publish(ModerationEvent event) {
        if ("MESSAGE".equals(event.getContentType())) {
            publishMessageEvent(event);
            return;
        }
        messagingTemplate.convertAndSend(MODERATION_TOPIC, event);
    }

    private void publishMessageEvent(ModerationEvent event) {
        if (event.getConversationId() == null) {
            return;
        }
        if ("group".equalsIgnoreCase(event.getConversationType())) {
            messagingTemplate.convertAndSend(
                    "/topic/conversation-" + event.getConversationId(), event);
            return;
        }

        privateConversationRepository.findWithParticipantsById(event.getConversationId()).ifPresent(conversation ->
                conversation.getParticipants().forEach(user ->
                        messagingTemplate.convertAndSend(
                                "/user/" + user.getId() + "/queue/moderation", event)));
    }
}
