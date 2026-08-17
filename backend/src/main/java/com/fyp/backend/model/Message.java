package com.fyp.backend.model;

import com.fyp.backend.dto.MessageDto;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Entity
@Data
@NoArgsConstructor
@Table(name = "messages", indexes = {
        // Backs keyset pagination of chat history (newest-first within a conversation).
        @Index(name = "idx_messages_conversation_id_id", columnList = "conversation_id, id"),
        @Index(name = "idx_messages_conversation_sender", columnList = "conversation_id, sender_id")
})
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String content;

    private String type;  // "text", "image", etc.

    private String conversationType;  // ✅ New column (group/private)

    // Pending-review shadow flag: set when the message is reported, cleared when
    // an admin resolves the report as "no problem". Everyone except the sender
    // sees a "Reported, pending review" placeholder while it is true.
    // Wrapper type: rows created before the column existed are NULL (= false).
    @org.hibernate.annotations.ColumnDefault("false")
    private Boolean reported = false;

    private Timestamp timestamp;

    @ManyToOne
    @JoinColumn(name = "conversation_id", nullable = false)
    private Conversation conversation;

    @ManyToOne
    @JoinColumn(name = "sender_id", nullable = false)
    private User sender;

    @OneToMany(mappedBy = "message", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<MessageDeliveryStatus> deliveryStatuses = new ArrayList<>();

    /**
     * Who this message calls out by name.
     *
     * Stored as ids chosen from a picker rather than parsed back out of the text:
     * names contain spaces, two people can share one, and a mention has to keep
     * pointing at the same person after they change theirs.
     */
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(name = "message_mentions", joinColumns = @JoinColumn(name = "message_id"), indexes = {
            @Index(name = "idx_message_mentions_user", columnList = "user_id")
    })
    @Column(name = "user_id")
    private Set<Long> mentionedUserIds = new HashSet<>();

    /**
     * @all, which group admins may use. A flag rather than every participant id:
     * in the app-level group that would be one row per member per message.
     * Wrapper type because rows predating the column are NULL (= false).
     */
    @org.hibernate.annotations.ColumnDefault("false")
    private Boolean mentionsEveryone = false;



    // ✅ Updated constructor to initialize conversationType
    public Message(MessageDto messageDto, Conversation conversation, User sender, String timestampStr) {
        this.content = messageDto.getContent();
        this.type = messageDto.getType();
        this.conversation = conversation;
        this.sender = sender;
        this.conversationType = messageDto.getConversationType(); // Assign conversationType
        this.timestamp = Timestamp.valueOf(timestampStr);
        // Copied as sent; ChatService is what validates that the ids are really
        // participants and that @all came from someone allowed to use it.
        this.mentionedUserIds = messageDto.getMentionedUserIds() == null
                ? new HashSet<>()
                : new HashSet<>(messageDto.getMentionedUserIds());
        this.mentionsEveryone = messageDto.isMentionsEveryone();
    }
}
