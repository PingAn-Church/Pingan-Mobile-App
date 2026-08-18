package com.fyp.backend.mq;

import java.util.List;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.service.LocalizedText;
import com.fyp.backend.service.PushNotificationService;
import com.fyp.backend.service.assistant.AssistantService;

import lombok.RequiredArgsConstructor;

/** Executes bounded fan-out jobs outside the request and database transaction. */
@Component
@RequiredArgsConstructor
public class FanoutConsumer {

    private final SimpMessagingTemplate messagingTemplate;
    private final PushNotificationService pushNotificationService;
    private final AssistantService assistantService;

    // The broadcast queue is anonymous — one per instance, named at declaration —
    // so it is resolved from the bean rather than by a fixed name.
    @RabbitListener(queues = "#{broadcastQueue.name}",
            containerFactory = "broadcastRabbitListenerContainerFactory")
    public void consumeBroadcast(FanoutTask task) {
        requireKind(task, FanoutTask.CHAT_BROADCAST);
        broadcast(task.getMessage());
    }

    @RabbitListener(queues = FanoutPublisher.PUSH_QUEUE,
            containerFactory = "pushRabbitListenerContainerFactory")
    public void consumePush(FanoutTask task) {
        requireKind(task, FanoutTask.PUSH_BATCH);
        pushNotificationService.sendQueuedBatch(
                task.getRecipientIds(), localized(task.getBodyEn(), task.getBodyZh()),
                localized(task.getTitleEn(), task.getTitleZh()), task.getConversationId(),
                task.getConversationType(), task.getThreadId(), task.isRespectMute());
    }

    /**
     * Its own queue and container: an LLM call is slow and paid for, so it neither
     * queues behind push batches nor inherits their five in-process retries.
     *
     * AssistantService does not throw — it answers with a fallback instead — so a
     * failure here should not reach the retry advice at all.
     */
    @RabbitListener(queues = FanoutPublisher.ASSISTANT_QUEUE,
            containerFactory = "assistantRabbitListenerContainerFactory")
    public void consumeAssistantReply(FanoutTask task) {
        requireKind(task, FanoutTask.ASSISTANT_REPLY);
        assistantService.answer(task.getConversationId(), task.getTriggerMessageId(), task.getAskerId());
    }

    private void broadcast(MessageDto message) {
        if (message == null || message.getConversationId() == null) return;

        if ("group".equals(message.getConversationType())) {
            messagingTemplate.convertAndSend(
                    "/topic/conversation-" + message.getConversationId(), message);
            return;
        }

        messagingTemplate.convertAndSend(
                "/user/" + message.getSenderId() + "/queue/messages", message);
        for (Long recipientId : safe(message.getRecipientIds())) {
            messagingTemplate.convertAndSend(
                    "/user/" + recipientId + "/queue/messages", message);
        }
    }

    private LocalizedText localized(String english, String chinese) {
        return language -> language != null && language.toLowerCase().startsWith("zh")
                ? value(chinese)
                : value(english);
    }

    private String value(String text) {
        return text == null ? "" : text;
    }

    private List<Long> safe(List<Long> ids) {
        return ids == null ? List.of() : ids;
    }

    private void requireKind(FanoutTask task, String expected) {
        if (task == null || !expected.equals(task.getKind())) {
            throw new IllegalArgumentException("Unexpected fan-out task for this queue");
        }
    }
}
