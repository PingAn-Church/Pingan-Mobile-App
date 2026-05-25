package com.fyp.backend.dto;

import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageDeliveryStatus;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Data
@NoArgsConstructor
public class MessageDto {
    private Long messageId;
    private String content;
    private String type;
    private String timestamp;
    private Long conversationId;
    private String conversationType;
    private Long senderId;
    private String senderFirstName;
    private String senderLastName;

    private List<Long> recipientIds = new ArrayList<>();
    private boolean edited = false;
    private boolean deleted = false;

    // ✅ Change from Map<Long, String> to Map<String, String> to ensure proper JSON conversion
    private Map<String, String> deliveryStatus;

    public MessageDto(Message message) {
        this.messageId = message.getId();
        this.content = message.getContent();
        this.type = message.getType();
        this.timestamp = message.getTimestamp().toString();
        this.conversationId = message.getConversation().getId();
        this.conversationType = message.getConversationType();
        this.senderId = message.getSender().getId();
        this.senderFirstName = message.getSender().getFirstName();
        this.senderLastName = message.getSender().getLastName();

        // ✅ Extract recipient IDs (excluding sender)
        this.recipientIds = message.getConversation().getParticipants().stream()
                .filter(user -> !user.getId().equals(senderId))
                .map(user -> user.getId())
                .collect(Collectors.toList());

        // ✅ Convert Long keys to String for correct JSON serialization
        this.deliveryStatus = message.getDeliveryStatuses().stream()
                .collect(Collectors.toMap(
                        status -> String.valueOf(status.getUser().getId()), // Convert Long to String
                        MessageDeliveryStatus::getStatus
                ));
    }
}

