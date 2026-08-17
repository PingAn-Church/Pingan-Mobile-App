package com.fyp.backend.mq;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.util.List;
import java.util.stream.LongStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.service.LocalizedText;

@ExtendWith(MockitoExtension.class)
class FanoutPublisherTest {

    @Mock private RabbitTemplate rabbitTemplate;
    @InjectMocks private FanoutPublisher publisher;

    @Test
    void publishesOneBroadcastAndBoundedPushChunks() {
        MessageDto message = new MessageDto();
        message.setConversationId(7L);
        message.setConversationType("group");
        List<Long> plain = LongStream.rangeClosed(1, 205).boxed().toList();
        List<Long> mentioned = List.of(301L, 302L);
        LocalizedText title = language -> "zh".equals(language) ? "标题" : "Title";
        LocalizedText body = language -> "zh".equals(language) ? "正文" : "Body";

        publisher.publishChat(message, plain, mentioned, title, body, body);

        // The broadcast goes to an exchange so every instance holding sockets gets
        // a copy; the push batches go to one shared work queue so exactly one
        // instance sends each of them.
        ArgumentCaptor<FanoutTask> broadcast = ArgumentCaptor.forClass(FanoutTask.class);
        verify(rabbitTemplate).convertAndSend(
                eq(FanoutPublisher.BROADCAST_EXCHANGE), eq(""), broadcast.capture());
        assertEquals(FanoutTask.CHAT_BROADCAST, broadcast.getValue().getKind());

        ArgumentCaptor<String> queues = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<FanoutTask> tasks = ArgumentCaptor.forClass(FanoutTask.class);
        verify(rabbitTemplate, times(4)).convertAndSend(queues.capture(), tasks.capture());
        assertTrue(queues.getAllValues().stream()
                .allMatch(FanoutPublisher.PUSH_QUEUE::equals));

        List<FanoutTask> pushTasks = tasks.getAllValues();
        assertTrue(pushTasks.stream().allMatch(task ->
                FanoutTask.PUSH_BATCH.equals(task.getKind())
                        && task.getRecipientIds().size() <= 100));
        assertEquals(List.of(100, 100, 5, 2), pushTasks.stream()
                .map(task -> task.getRecipientIds().size())
                .toList());
        assertEquals("Title", pushTasks.get(0).getTitleEn());
        assertEquals("标题", pushTasks.get(0).getTitleZh());
    }
}
