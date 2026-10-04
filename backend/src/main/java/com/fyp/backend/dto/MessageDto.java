package com.fyp.backend.dto;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageDeliveryStatus;
import com.fyp.backend.model.PrivateConversation;
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
    // Written by the in-app assistant rather than a person. The client draws the
    // app icon, an "AI" badge and the disclaimer footer off this.
    private boolean senderBot = false;
    // The assistant's Chinese name, so a bot message names itself in the reader's
    // language without the client having to hold the conversation to find out.
    // Null on every message a person sent.
    private String senderDisplayNameZh;

    private List<Long> recipientIds = new ArrayList<>();
    // Ids this message calls out by name, and the @all flag. Both travel in
    // BOTH directions: the client sends what the composer's picker recorded,
    // and the server sends back what it accepted after validating it.
    private List<Long> mentionedUserIds = new ArrayList<>();
    private boolean mentionsEveryone = false;
    private boolean edited = false;
    private boolean deleted = false;
    private boolean reported = false;
    // The event an "event" message shares. Sent by the client to name the event
    // (the server checks it and writes the body itself); null on everything else.
    private Long sharedEventId;
    // The sticker a "sticker" message shows, as a StickerCatalog id ("basic.praying").
    // Sent by the client to name the sticker; the server checks it and writes the
    // body (the sticker's fallback emoji) itself. Null on everything else.
    private String stickerId;
    // Replying: the client names the message it answers here; the server checks
    // it sits in the same conversation. Comes back on every stored reply too.
    private Long replyToMessageId;
    // The quoted message as this reader may see it — server-filled, never sent by
    // a client. Absent on a message that replies to nothing.
    private ReplyPreviewDto replyTo;
    // Emoji tallies, filled in by MessageReactionService for a page of history
    // and on every re-broadcast of the message. Empty on a fresh message.
    private List<ReactionSummaryDto> reactions = new ArrayList<>();
    // The poll a "poll" message carries, filled in by PollService for a page of
    // history and on every re-broadcast; null on every other message. On the way
    // in it names a freshly created poll for ChatService.createPoll to bind.
    private PollDto poll;

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
        this.sharedEventId = canViewReportedContent ? message.getSharedEventId() : null;
        this.stickerId = canViewReportedContent ? message.getStickerId() : null;
        Message quoted = message.getReplyTo();
        this.replyToMessageId = quoted == null ? null : quoted.getId();
        this.replyTo = ReplyPreviewDto.of(quoted, viewer);
        this.type = message.getType();
        this.timestamp = message.getTimestamp().toString();
        this.conversationId = message.getConversation().getId();
        this.conversationType = message.getConversationType();
        this.senderId = message.getSender().getId();
        this.senderFirstName = displayFirstName(message.getSender());
        this.senderLastName = displayLastName(message.getSender());
        this.senderProfileImage = displayProfileImage(message.getSender());
        this.senderBot = message.getSender() != null && message.getSender().isBot();
        this.senderDisplayNameZh = this.senderBot ? message.getSender().getDisplayNameZh() : null;
        this.reported = Boolean.TRUE.equals(message.getReported());
        this.mentionedUserIds = message.getMentionedUserIds() == null
                ? new ArrayList<>()
                : new ArrayList<>(message.getMentionedUserIds());
        this.mentionsEveryone = Boolean.TRUE.equals(message.getMentionsEveryone());

        // ✅ Extract recipient IDs (excluding sender)
        //
        // Left empty for the app-level group: its recipients are the whole church,
        // so a page of history would otherwise repeat several hundred ids on every
        // message. Nothing downstream reads this field from a stored message —
        // ChatService recomputes the real recipient list when it fans a message
        // out (see buildResponseDto), and the client only echoes it back on send,
        // where the server ignores what it was given.
        if (!isAppLevelGroup(message)) {
            this.recipientIds = message.getConversation().getParticipants().stream()
                    .filter(user -> !user.getId().equals(senderId))
                    .map(user -> user.getId())
                    .collect(Collectors.toList());
        }

        // ✅ Convert Long keys to String for correct JSON serialization
        //
        // Private chats only. Group messages stopped storing receipts when read
        // state moved to a watermark, and leaving the map empty for them keeps the
        // ticks consistent: without this, group messages written before that change
        // would still show Seen while newer ones showed nothing.
        this.deliveryStatus = message.getConversation() instanceof PrivateConversation
                ? message.getDeliveryStatuses().stream()
                        .collect(Collectors.toMap(
                                status -> String.valueOf(status.getUser().getId()), // Convert Long to String
                                MessageDeliveryStatus::getStatus
                        ))
                : Map.of();
    }

    private static boolean isAppLevelGroup(Message message) {
        return message.getConversation() instanceof GroupConversation group && group.isAppLevel();
    }

    public static String displayFirstName(User user) {
        if (user == null) {
            return "Unknown";
        }
        return user.isDeletedAccount() ? "Deleted" : user.getFirstName();
    }

    public static String displayLastName(User user) {
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
