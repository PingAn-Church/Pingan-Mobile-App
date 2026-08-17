package com.fyp.backend.mq;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.service.LocalizedText;
import com.fyp.backend.service.PushNotificationService;

@ExtendWith(MockitoExtension.class)
class FanoutConsumerTest {

    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private PushNotificationService pushNotificationService;
    @InjectMocks private FanoutConsumer consumer;

    @Test
    void groupBroadcastUsesOneConversationTopic() {
        MessageDto message = message("group", List.of());

        consumer.consumeBroadcast(FanoutTask.builder()
                .kind(FanoutTask.CHAT_BROADCAST)
                .message(message)
                .build());

        verify(messagingTemplate).convertAndSend("/topic/conversation-42", message);
        verify(messagingTemplate, never()).convertAndSend(
                org.mockito.ArgumentMatchers.startsWith("/user/"), any(Object.class));
    }

    @Test
    void privateBroadcastTargetsSenderAndRecipientQueues() {
        MessageDto message = message("private", List.of(2L));

        consumer.consumeBroadcast(FanoutTask.builder()
                .kind(FanoutTask.CHAT_BROADCAST)
                .message(message)
                .build());

        verify(messagingTemplate).convertAndSend("/user/1/queue/messages", message);
        verify(messagingTemplate).convertAndSend("/user/2/queue/messages", message);
    }

    @Test
    void pushTaskDelegatesTheBoundedBatch() {
        FanoutTask task = FanoutTask.builder()
                .kind(FanoutTask.PUSH_BATCH)
                .recipientIds(List.of(2L, 3L))
                .titleEn("Title")
                .titleZh("标题")
                .bodyEn("Body")
                .bodyZh("正文")
                .conversationId(42L)
                .conversationType("group")
                .respectMute(true)
                .build();

        consumer.consumePush(task);

        verify(pushNotificationService).sendQueuedBatch(
                eq(List.of(2L, 3L)), any(LocalizedText.class), any(LocalizedText.class),
                eq(42L), eq("group"), eq(null), eq(true));
    }

    private MessageDto message(String type, List<Long> recipientIds) {
        MessageDto message = new MessageDto();
        message.setConversationId(42L);
        message.setConversationType(type);
        message.setSenderId(1L);
        message.setRecipientIds(recipientIds);
        return message;
    }
}
