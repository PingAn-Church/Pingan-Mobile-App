package com.fyp.backend.mq;

import com.fyp.backend.dto.MessageDto;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.amqp.core.Queue;

@Component
public class MessagePublisher {

    @Autowired private RabbitTemplate rabbitTemplate;
    @Autowired private RabbitAdmin rabbitAdmin;

    public void queueMessage(String userEmail, MessageDto message) {
        String queueName = "chat.queue." + userEmail;

        // ✅ Ensure queue exists
        if (rabbitAdmin.getQueueProperties(queueName) == null) {
            System.out.println("🧱 Declaring queue: " + queueName);
            rabbitAdmin.declareQueue(new Queue(queueName, true));
        }

        rabbitTemplate.convertAndSend(queueName, message);
        System.out.println("📦 Queued message for: " + userEmail);
    }
}
