package com.fyp.backend.dto;

import java.util.Map;

import com.fyp.backend.model.Message;
import com.fyp.backend.model.User;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * The newest message of a conversation, as shipped inside the conversation list
 * payload so the client can draw each row's preview, sender line and tick without
 * fetching a page of history per conversation.
 *
 * Deliberately a slim sibling of {@link MessageDto} with the SAME field names and
 * formats (timestamp string, String-keyed deliveryStatus) so the client can treat
 * it like any message object. It is built from batched queries, so unlike
 * MessageDto's constructor it never walks the conversation's participants or the
 * message's lazy delivery-status collection — the caller passes what it batched.
 */
@Data
@NoArgsConstructor
public class LastMessageDto {

    private Long messageId;
    private Long senderId;
    private String senderFirstName;
    private String senderLastName;
    private boolean senderBot = false;
    private String senderDisplayNameZh;
    private String type;
    private String content;
    private String timestamp;
    private boolean reported = false;
    private Map<String, String> deliveryStatus = Map.of();

    /**
     * @param viewer          whose list this is — reported content is masked for
     *                        everyone but the sender and admins, mirroring MessageDto
     * @param deliveryStatus  batched receipts for this message (private chats;
     *                        pass an empty map for groups, which carry none)
     */
    public LastMessageDto(Message message, User viewer, Map<String, String> deliveryStatus) {
        User sender = message.getSender();
        this.messageId = message.getId();
        this.senderId = sender == null ? null : sender.getId();
        this.senderFirstName = sender == null ? "Unknown"
                : sender.isDeletedAccount() ? "Deleted" : sender.getFirstName();
        this.senderLastName = sender == null ? "User"
                : sender.isDeletedAccount() ? "Account" : sender.getLastName();
        this.senderBot = sender != null && sender.isBot();
        this.senderDisplayNameZh = this.senderBot ? sender.getDisplayNameZh() : null;
        this.type = message.getType();
        this.timestamp = message.getTimestamp().toString();
        this.reported = Boolean.TRUE.equals(message.getReported());

        boolean canViewReportedContent = viewer == null
                || !this.reported
                || (sender != null && viewer.getId().equals(sender.getId()))
                || viewer.isAdmin();
        this.content = canViewReportedContent ? message.getContent() : null;
        this.deliveryStatus = deliveryStatus == null ? Map.of() : deliveryStatus;
    }
}
