package com.fyp.backend.dto;

import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageDeliveryStatus;
import com.fyp.backend.model.User;
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
    // Stored object path for the sender's avatar, so a group message can show who
    // is speaking without the client first loading the whole participant roster —
    // which the app-level group deliberately does not ship.
    private String senderProfileImage;

    private List<Long> recipientIds = new ArrayList<>();
    private boolean edited = false;
    private boolean deleted = false;
    private boolean reported = false;

    // ✅ Change from Map<Long, String> to Map<String, String> to ensure proper JSON conversion
    private Map<String, String> deliveryStatus;

    public MessageDto(Message message) {
        this(message, null);
    }

    public MessageDto(Message message, User viewer) {
        this.messageId = message.getId();
        boolean canViewReportedContent = viewer == null
                || !Boolean.TRUE.equals(message.getReported())
                || (message.getSender() != null && viewer.getId().equals(message.getSender().getId()))
                || viewer.isAdmin();
        this.content = canViewReportedContent ? message.getContent() : null;
        this.type = message.getType();
        this.timestamp = message.getTimestamp().toString();
        this.conversationId = message.getConversation().getId();
        this.conversationType = message.getConversationType();
        this.senderId = message.getSender().getId();
        this.senderFirstName = displayFirstName(message.getSender());
        this.senderLastName = displayLastName(message.getSender());
        this.senderProfileImage = displayProfileImage(message.getSender());
        this.reported = Boolean.TRUE.equals(message.getReported());

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

    private String displayFirstName(User user) {
        if (user == null) {
            return "Unknown";
        }
        return user.isDeletedAccount() ? "Deleted" : user.getFirstName();
    }

    private String displayLastName(User user) {
        if (user == null) {
            return "User";
        }
        return user.isDeletedAccount() ? "Account" : user.getLastName();
    }

    /** A deleted account keeps no face, matching the name fields above. */
    private String displayProfileImage(User user) {
        if (user == null || user.isDeletedAccount()) {
            return null;
        }
        return user.getProfileImage();
    }
}
