package com.fyp.backend.mq;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.service.LocalizedText;

import lombok.RequiredArgsConstructor;

/** Publishes bounded fan-out jobs after the owning database row is committed. */
@Component
@RequiredArgsConstructor
public class FanoutPublisher {

    /** Fan-out: every instance gets its own copy, for the clients it holds sockets to. */
    public static final String BROADCAST_EXCHANGE = "chat.broadcast.exchange";
    /** Work queue: one instance sends each push batch, whichever picks it up first. */
    public static final String PUSH_QUEUE = "notification.push.queue";
    static final int RECIPIENT_BATCH_SIZE = 100;

    private static final Logger log = LoggerFactory.getLogger(FanoutPublisher.class);

    private final RabbitTemplate rabbitTemplate;

    public void publishChat(MessageDto message, List<Long> plainRecipients,
            List<Long> mentionedRecipients, LocalizedText title, LocalizedText body,
            LocalizedText mentionedBody) {
        publish(FanoutTask.builder()
                .kind(FanoutTask.CHAT_BROADCAST)
                .message(message)
                .build());

        publishPushBatches(plainRecipients, title, body,
                message.getConversationId(), message.getConversationType(), null, true);
        publishPushBatches(mentionedRecipients, title, mentionedBody,
                message.getConversationId(), message.getConversationType(), null, false);
    }

    public void publishTopic(List<Long> recipients, LocalizedText title,
            LocalizedText body, Long threadId) {
        publishPushBatches(recipients, title, body, null, "thread", threadId, false);
    }

    private void publishPushBatches(List<Long> recipients, LocalizedText title,
            LocalizedText body, Long conversationId, String conversationType,
            Long threadId, boolean respectMute) {
        if (recipients == null || recipients.isEmpty()) return;

        for (int from = 0; from < recipients.size(); from += RECIPIENT_BATCH_SIZE) {
            int to = Math.min(from + RECIPIENT_BATCH_SIZE, recipients.size());
            publish(FanoutTask.builder()
                    .kind(FanoutTask.PUSH_BATCH)
                    .recipientIds(new ArrayList<>(recipients.subList(from, to)))
                    .titleEn(render(title, "en"))
                    .titleZh(render(title, "zh"))
                    .bodyEn(render(body, "en"))
                    .bodyZh(render(body, "zh"))
                    .conversationId(conversationId)
                    .conversationType(conversationType)
                    .threadId(threadId)
                    .respectMute(respectMute)
                    .build());
        }
    }

    private String render(LocalizedText text, String language) {
        return text == null ? "" : text.render(language);
    }

    private void publish(FanoutTask task) {
        try {
            if (FanoutTask.CHAT_BROADCAST.equals(task.getKind())) {
                // Exchange, not a queue: every instance holding sockets needs a copy.
                rabbitTemplate.convertAndSend(BROADCAST_EXCHANGE, "", task);
            } else {
                rabbitTemplate.convertAndSend(PUSH_QUEUE, task);
            }
        } catch (RuntimeException e) {
            // The message/reply is already durable in the database. Clients recover it
            // on reconnect even if Rabbit is unavailable at this exact boundary.
            log.error("Could not enqueue {} fan-out task", task.getKind(), e);
        }
    }
}
