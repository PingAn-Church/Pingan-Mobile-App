package com.fyp.backend.repository;

import com.fyp.backend.model.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {
    boolean existsByContentContaining(String fragment);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Message m WHERE m.id = :id")
    Optional<Message> findByIdForUpdate(@Param("id") Long id);

    long countBySenderId(Long senderId);

    // Cursor (keyset) pagination, newest-first. The first page omits `before`;
    // subsequent pages pass the smallest id seen so far to fetch older messages.
    List<Message> findByConversationIdOrderByIdDesc(Long conversationId, Pageable pageable);
    List<Message> findByConversationIdAndIdLessThanOrderByIdDesc(Long conversationId, Long beforeId, Pageable pageable);

    @Query("SELECT m.content FROM Message m WHERE m.conversation.id = :conversationId "
            + "AND lower(m.type) IN ('image', 'voice') ORDER BY m.id ASC")
    List<String> findMediaContentsByConversationId(@Param("conversationId") Long conversationId, Pageable pageable);

    @Query("SELECT m.content FROM Message m WHERE m.conversation.id = :conversationId "
            + "AND m.sender.id = :senderId AND lower(m.type) IN ('image', 'voice') ORDER BY m.id ASC")
    List<String> findMediaContentsByConversationIdAndSenderId(
            @Param("conversationId") Long conversationId,
            @Param("senderId") Long senderId,
            Pageable pageable);

    // Unread = messages from other people in this conversation not yet READ by the user.
    @Query("SELECT COUNT(m) FROM Message m WHERE m.conversation.id = :conversationId AND m.sender.id <> :userId "
            + "AND NOT EXISTS (SELECT 1 FROM MessageDeliveryStatus ds WHERE ds.message.id = m.id "
            + "AND ds.user.id = :userId AND ds.status = 'READ')")
    long countUnread(@Param("conversationId") Long conversationId, @Param("userId") Long userId);

    /**
     * Conversations holding an unread message that calls this user out by name.
     *
     * One query for the whole chat list rather than one per row — the list is
     * already several queries deep and being @-mentioned is rare, so most calls
     * come back empty.
     */
    @Query("SELECT DISTINCT m.conversation.id FROM Message m WHERE m.sender.id <> :userId "
            + "AND (m.mentionsEveryone = true OR :userId MEMBER OF m.mentionedUserIds) "
            + "AND NOT EXISTS (SELECT 1 FROM MessageDeliveryStatus ds WHERE ds.message.id = m.id "
            + "AND ds.user.id = :userId AND ds.status = 'READ')")
    List<Long> findConversationIdsWithUnreadMention(@Param("userId") Long userId);

    // Unread across every conversation the user belongs to — the number that goes on
    // the app icon. Muted conversations are left out: they are silenced app-wide, not
    // just for pushes. Reading m.conversation.id uses the FK column directly, so this
    // never has to resolve the TABLE_PER_CLASS Conversation hierarchy.
    @Query("SELECT COUNT(m) FROM Message m WHERE m.sender.id <> :userId "
            + "AND NOT EXISTS (SELECT 1 FROM MessageDeliveryStatus ds WHERE ds.message.id = m.id "
            + "AND ds.user.id = :userId AND ds.status = 'READ') "
            + "AND NOT EXISTS (SELECT 1 FROM ConversationMute cm WHERE cm.userId = :userId "
            + "AND cm.conversationId = m.conversation.id) "
            + "AND (m.conversation.id IN "
            + "(SELECT g.id FROM GroupConversation g JOIN g.participants p WHERE p.id = :userId) "
            + "OR m.conversation.id IN "
            + "(SELECT pc.id FROM PrivateConversation pc "
            + "WHERE pc.userOne.id = :userId OR pc.userTwo.id = :userId))")
    long countTotalUnread(@Param("userId") Long userId);

    void deleteById(Long messageId);

    // Account-deletion sweep: drop this user's read-receipt join rows across every
    // message (the join table has no entity, so it can't be cascaded otherwise).
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "DELETE FROM message_read_receipts WHERE user_id = :userId", nativeQuery = true)
    void deleteReadReceiptsByUserId(@Param("userId") Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "DELETE FROM message_read_receipts WHERE message_id IN "
            + "(SELECT id FROM messages WHERE conversation_id = :conversationId)", nativeQuery = true)
    void deleteReadReceiptsByConversationId(@Param("conversationId") Long conversationId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "DELETE FROM message_read_receipts WHERE message_id IN "
            + "(SELECT id FROM messages WHERE conversation_id = :conversationId AND sender_id = :senderId)",
            nativeQuery = true)
    void deleteReadReceiptsByConversationIdAndSenderId(
            @Param("conversationId") Long conversationId,
            @Param("senderId") Long senderId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM Message m WHERE m.conversation.id = :conversationId")
    void deleteByConversationIdBulk(@Param("conversationId") Long conversationId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM Message m WHERE m.conversation.id = :conversationId AND m.sender.id = :senderId")
    void deleteByConversationIdAndSenderIdBulk(
            @Param("conversationId") Long conversationId,
            @Param("senderId") Long senderId);

    @Query(value = "SELECT COUNT(*) FROM message_read_receipts WHERE user_id = :userId", nativeQuery = true)
    long countReadReceiptsByUserId(@Param("userId") Long userId);
}
