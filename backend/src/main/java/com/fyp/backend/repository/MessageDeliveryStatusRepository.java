package com.fyp.backend.repository;

import com.fyp.backend.model.MessageDeliveryStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MessageDeliveryStatusRepository extends JpaRepository<MessageDeliveryStatus, Long> {
    List<MessageDeliveryStatus> findByMessageId(Long messageId);

    /** Receipts for many messages at once — the chat list's newest-message previews. */
    List<MessageDeliveryStatus> findByMessageIdIn(java.util.Collection<Long> messageIds);

    long countByUserId(Long userId);

    // Account-deletion sweep: drop this user's delivery rows across every message
    // (including others' messages they were a recipient of), in one statement.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM MessageDeliveryStatus d WHERE d.user.id = :userId")
    void deleteByUserId(@Param("userId") Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "INSERT INTO message_delivery_status (message_id, user_id, status, timestamp) "
            + "SELECT m.id, :userId, 'SENT', CURRENT_TIMESTAMP FROM messages m "
            + "WHERE m.conversation_id = :conversationId AND m.sender_id <> :userId "
            + "AND NOT EXISTS (SELECT 1 FROM message_delivery_status d "
            + "WHERE d.message_id = m.id AND d.user_id = :userId)", nativeQuery = true)
    void insertSentStatusesForConversation(
            @Param("conversationId") Long conversationId,
            @Param("userId") Long userId);

    // Marks a whole conversation read for one user in a single statement. Per-message
    // receipts only ever cover the history page the client has loaded, so opening a
    // chat with hundreds of unread used to leave most of them unread server-side.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "UPDATE message_delivery_status SET status = 'READ', timestamp = CURRENT_TIMESTAMP "
            + "WHERE user_id = :userId AND status <> 'READ' AND message_id IN "
            + "(SELECT id FROM messages WHERE conversation_id = :conversationId AND sender_id <> :userId)",
            nativeQuery = true)
    int markConversationRead(
            @Param("conversationId") Long conversationId,
            @Param("userId") Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "DELETE FROM message_delivery_status WHERE user_id = :userId "
            + "AND message_id IN (SELECT id FROM messages WHERE conversation_id = :conversationId)",
            nativeQuery = true)
    void deleteByConversationIdAndUserId(
            @Param("conversationId") Long conversationId,
            @Param("userId") Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "DELETE FROM message_delivery_status WHERE message_id IN "
            + "(SELECT id FROM messages WHERE conversation_id = :conversationId)", nativeQuery = true)
    void deleteByConversationId(@Param("conversationId") Long conversationId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "DELETE FROM message_delivery_status WHERE message_id IN "
            + "(SELECT id FROM messages WHERE conversation_id = :conversationId AND sender_id = :senderId)",
            nativeQuery = true)
    void deleteByConversationIdAndSenderId(
            @Param("conversationId") Long conversationId,
            @Param("senderId") Long senderId);
}
