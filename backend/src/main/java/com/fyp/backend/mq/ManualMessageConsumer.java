package com.fyp.backend.mq;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.repository.UserRepository;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import com.fyp.backend.model.User;

@Component
public class ManualMessageConsumer {

    @Autowired private RabbitTemplate rabbitTemplate;
    @Autowired private SimpMessagingTemplate messagingTemplate;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private RabbitAdmin rabbitAdmin;
    @Autowired private UserRepository userRepository;

    public void drainUserQueue(String userEmail) {
        String queueName = "chat.queue." + userEmail;
        System.out.println("📥 Draining queue for: " + userEmail);

        // ✅ Create queue if it doesn't exist
        if (rabbitAdmin.getQueueProperties(queueName) == null) {
            System.out.println("🧱 Queue doesn't exist. Creating: " + queueName);
            rabbitAdmin.declareQueue(new Queue(queueName, true)); // durable queue
        }

        while (true) {
            Object messageObj = rabbitTemplate.receiveAndConvert(queueName);
            if (messageObj == null) break;

            try {
                MessageDto message = objectMapper.convertValue(messageObj, MessageDto.class);

                // ✅ Lookup userId from email (or pass it in)
                Long userId = userRepository.findByEmail(userEmail).map(User::getId).orElse(null);

                if (userId != null) {
                    String destination = "/user/" + userId + "/queue/messages";
                    messagingTemplate.convertAndSend(destination, message);
                    System.out.println("📬 Delivered queued message to " + destination);
                } else {
                    System.err.println("❌ No userId found for email: " + userEmail);
                }

            } catch (Exception e) {
                System.err.println("❌ Failed to deliver queued message: " + e.getMessage());
            }
        }
    }
}
