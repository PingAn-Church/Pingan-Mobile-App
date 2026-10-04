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
// Lazy Message proxies (a page of replies' quoted originals) load in batches of
// 30 rather than one query each. Hibernate 6 only accepts this on the entity,
// not on the @ManyToOne that points at it.
@org.hibernate.annotations.BatchSize(size = 30)
@Table(name = "messages", indexes = {
        // Backs keyset pagination of chat history (newest-first within a conversation).
        @Index(name = "idx_messages_conversation_id_id", columnList = "conversation_id, id"),
        @Index(name = "idx_messages_conversation_sender", columnList = "conversation_id, sender_id"),
        // Lets ON DELETE SET NULL find a deleted message's replies without a table scan.
        @Index(name = "idx_messages_reply_to", columnList = "reply_to_message_id")
})
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Unbounded on purpose.
     *
     * With no annotation Hibernate maps a String to varchar(255), which every
     * ordinary chat message fits inside — so the limit went unnoticed until the
     * assistant started quoting scripture, where a single substituted verse can be
     * longer than that on its own and the insert failed. Thread.content ran into
     * the same thing and settled for length = 5000; text has no ceiling to
     * rediscover later.
     */
    @Column(columnDefinition = "text")
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
     * DatabaseIntegrityMigration adds cascading message/user foreign keys while
     * this remains an ElementCollection for normal entity writes.
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

    /**
     * The message this one answers — set only on assistant replies.
     *
     * This is the idempotency key. RabbitMQ is at-least-once, and the listener's
     * retry advice re-runs a failed handler in-process, so a worker that posts a
     * reply and then throws would post another on the next attempt. A partial
     * unique index on this column (see DatabaseIntegrityMigration) makes "one
     * reply per triggering message" a database guarantee rather than something
     * a cache is trusted to remember.
     *
     * A plain id rather than an association: the foreign key is installed by the
     * migration as ON DELETE SET NULL, matching how message_mentions is handled,
     * so deleting a question does not delete the answer everyone already read.
     *
     * NEVER expose this on MessageDto. A client able to set it could claim to
     * answer any message and, because of the unique index, permanently block the
     * assistant from ever replying to it.
     */
    @Column(name = "responds_to_message_id")
    private Long respondsToMessageId;

    /**
     * The event an "event" message shares; null on every other message.
     *
     * A plain id with no foreign key: deleting an event must not delete the
     * chat messages that once shared it. The card for a deleted event just says
     * so, and the stored body still reads sensibly on its own.
     */
    @Column(name = "shared_event_id")
    private Long sharedEventId;

    /**
     * The sticker a "sticker" message shows, as a {@link StickerCatalog} id;
     * null on every other message. The picture lives in the app, so this is all
     * that is stored — the body beside it is the sticker's fallback emoji.
     */
    @Column(name = "sticker_id", length = 64)
    private String stickerId;

    /**
     * The message this one quotes, or null. Set by the sender when they reply,
     * and by the assistant on its answers so each sits under its question.
     *
     * An association rather than a bare id so a DTO can draw the quote wherever
     * it is built; the class-level @BatchSize on Message keeps a page of history
     * to one extra query for all its quotes instead of one each. On the database
     * side the key is ON DELETE SET NULL, installed by DatabaseIntegrityMigration
     * — the key Hibernate generates on its own would refuse to delete a message
     * anyone has replied to. The reply stays; only its quote disappears.
     *
     * Excluded from equals/hashCode/toString: a self-reference in Lombok's
     * generated methods would force the lazy load, or worse, chase the chain.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reply_to_message_id")
    @lombok.ToString.Exclude
    @lombok.EqualsAndHashCode.Exclude
    private Message replyTo;


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
        // Validated by ChatService.prepareEventShare before it gets here.
        this.sharedEventId = messageDto.getSharedEventId();
        // Likewise checked against the catalog by ChatService.prepareSticker.
        this.stickerId = messageDto.getStickerId();
    }
}
