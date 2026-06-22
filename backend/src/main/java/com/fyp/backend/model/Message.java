package com.fyp.backend.model;

import com.fyp.backend.dto.MessageDto;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;

@Entity
@Data
@NoArgsConstructor
@Table(name = "messages", indexes = {
        // Backs keyset pagination of chat history (newest-first within a conversation).
        @Index(name = "idx_messages_conversation_id_id", columnList = "conversation_id, id")
})
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String content;

    private String type;  // "text", "image", etc.

    private String conversationType;  // ✅ New column (group/private)

    private Timestamp timestamp;

    @ManyToOne
    @JoinColumn(name = "conversation_id", nullable = false)
    private Conversation conversation;

    @ManyToOne
    @JoinColumn(name = "sender_id", nullable = false)
    private User sender;

    @ManyToMany
    @JoinTable(
            name = "message_read_receipts",
            joinColumns = @JoinColumn(name = "message_id"),
            inverseJoinColumns = @JoinColumn(name = "user_id")
    )
    private List<User> readByUsers;

    @OneToMany(mappedBy = "message", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<MessageDeliveryStatus> deliveryStatuses = new ArrayList<>();



    // ✅ Updated constructor to initialize conversationType
    public Message(MessageDto messageDto, Conversation conversation, User sender, String timestampStr) {
        this.content = messageDto.getContent();
        this.type = messageDto.getType();
        this.conversation = conversation;
        this.sender = sender;
        this.conversationType = messageDto.getConversationType(); // Assign conversationType
        this.timestamp = Timestamp.valueOf(timestampStr);
    }
}
