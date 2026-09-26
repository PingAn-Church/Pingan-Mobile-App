package com.fyp.backend.repository;

import com.fyp.backend.model.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
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

    /** The newest message in a conversation — where a read watermark is set to. */
    @Query("SELECT MAX(m.id) FROM Message m WHERE m.conversation.id = :conversationId")
    Long findNewestMessageId(@Param("conversationId") Long conversationId);

    /**
     * Unread = messages from other people in this conversation newer than the
     * user's read watermark.
     *
     * A range comparison on the id, so it rides the existing
     * (conversation_id, id) index instead of testing every message against a
     * delivery row. COALESCE covers somebody who has never opened the
     * conversation: no watermark yet means everything counts.
     */
    @Query("SELECT COUNT(m) FROM Message m WHERE m.conversation.id = :conversationId AND m.sender.id <> :userId "
            + "AND m.id > COALESCE((SELECT r.lastReadMessageId FROM ConversationReadState r "
            + "WHERE r.conversationId = :conversationId AND r.userId = :userId), 0)")
    long countUnread(@Param("conversationId") Long conversationId, @Param("userId") Long userId);

    /**
     * {@link #countUnread} for a whole chat list in one query instead of one per
     * conversation. Rows come back as [conversationId, count]; a conversation with
     * nothing unread is simply absent, so callers default to 0. Same watermark
     * subquery and FK-column read as the single-conversation form.
     */
    @Query("SELECT m.conversation.id, COUNT(m) FROM Message m "
            + "WHERE m.conversation.id IN :conversationIds AND m.sender.id <> :userId "
            + "AND m.id > COALESCE((SELECT r.lastReadMessageId FROM ConversationReadState r "
            + "WHERE r.conversationId = m.conversation.id AND r.userId = :userId), 0) "
            + "GROUP BY m.conversation.id")
    List<Object[]> countUnreadByConversationIds(
            @Param("conversationIds") java.util.Collection<Long> conversationIds,
            @Param("userId") Long userId);

    /**
     * The newest message of each conversation, one query for the whole chat list —
     * this is what the list rows preview, so the client no longer has to fetch a
     * page of history per conversation just to draw its own list. Sender is
     * join-fetched: every preview names its sender. Empty conversations simply
     * return no row.
     */
    @Query("SELECT m FROM Message m JOIN FETCH m.sender WHERE m.id IN "
            + "(SELECT MAX(m2.id) FROM Message m2 WHERE m2.conversation.id IN :conversationIds "
            + "GROUP BY m2.conversation.id)")
    List<Message> findNewestPerConversation(
            @Param("conversationIds") java.util.Collection<Long> conversationIds);

    /**
     * Conversations holding an unread message that calls this user out by name.
     *
     * One query for the whole chat list rather than one per row — the list is
     * already several queries deep and being @-mentioned is rare, so most calls
     * come back empty.
     */
    @Query("SELECT DISTINCT m.conversation.id FROM Message m WHERE m.sender.id <> :userId "
            + "AND (m.mentionsEveryone = true OR :userId MEMBER OF m.mentionedUserIds) "
            + "AND m.id > COALESCE((SELECT r.lastReadMessageId FROM ConversationReadState r "
            + "WHERE r.conversationId = m.conversation.id AND r.userId = :userId), 0)")
    List<Long> findConversationIdsWithUnreadMention(@Param("userId") Long userId);

    // Unread across every conversation the user belongs to — the number that goes on
    // the app icon. Muted conversations are left out: they are silenced app-wide, not
    // just for pushes. Reading m.conversation.id uses the FK column directly, so this
    // never has to resolve the TABLE_PER_CLASS Conversation hierarchy.
    @Query("SELECT COUNT(m) FROM Message m WHERE m.sender.id <> :userId "
            + "AND m.id > COALESCE((SELECT r.lastReadMessageId FROM ConversationReadState r "
            + "WHERE r.conversationId = m.conversation.id AND r.userId = :userId), 0) "
            + "AND NOT EXISTS (SELECT 1 FROM ConversationMute cm WHERE cm.userId = :userId "
            + "AND cm.conversationId = m.conversation.id) "
            + "AND (m.conversation.id IN "
            + "(SELECT g.id FROM GroupConversation g JOIN g.participants p WHERE p.id = :userId) "
            + "OR m.conversation.id IN "
            + "(SELECT pc.id FROM PrivateConversation pc "
            + "WHERE pc.userOne.id = :userId OR pc.userTwo.id = :userId))")
    long countTotalUnread(@Param("userId") Long userId);

    void deleteById(Long messageId);

    @Modifying(flushAutomatically = true)
    @Query(value = "DELETE FROM message_mentions WHERE message_id IN "
            + "(SELECT id FROM messages WHERE conversation_id = :conversationId)", nativeQuery = true)
    int deleteMentionRowsByConversationId(@Param("conversationId") Long conversationId);

    @Modifying(flushAutomatically = true)
    @Query(value = "DELETE FROM message_mentions WHERE message_id IN "
            + "(SELECT id FROM messages WHERE conversation_id = :conversationId AND sender_id = :senderId)",
            nativeQuery = true)
    int deleteMentionRowsByConversationIdAndSenderId(
            @Param("conversationId") Long conversationId,
            @Param("senderId") Long senderId);

    /** Removes references to an account from messages that remain after account cleanup. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "DELETE FROM message_mentions WHERE user_id = :userId", nativeQuery = true)
    int deleteMentionReferencesByUserId(@Param("userId") Long userId);

    // Reactions hang off messages by a plain id; a bulk JPQL delete of the
    // messages would leave them behind anywhere the cascading key is not installed.
    @Modifying(flushAutomatically = true)
    @Query(value = "DELETE FROM message_reactions WHERE message_id IN "
            + "(SELECT id FROM messages WHERE conversation_id = :conversationId)", nativeQuery = true)
    int deleteReactionRowsByConversationId(@Param("conversationId") Long conversationId);

    @Modifying(flushAutomatically = true)
    @Query(value = "DELETE FROM message_reactions WHERE message_id IN "
            + "(SELECT id FROM messages WHERE conversation_id = :conversationId AND sender_id = :senderId)",
            nativeQuery = true)
    int deleteReactionRowsByConversationIdAndSenderId(
            @Param("conversationId") Long conversationId,
            @Param("senderId") Long senderId);

    // Polls hang off their conversation by id; votes, then options, then the polls.
    @Modifying(flushAutomatically = true)
    @Query(value = "DELETE FROM poll_votes WHERE poll_id IN "
            + "(SELECT id FROM polls WHERE conversation_id = :conversationId)", nativeQuery = true)
    int deletePollVoteRowsByConversationId(@Param("conversationId") Long conversationId);

    @Modifying(flushAutomatically = true)
    @Query(value = "DELETE FROM poll_options WHERE poll_id IN "
            + "(SELECT id FROM polls WHERE conversation_id = :conversationId)", nativeQuery = true)
    int deletePollOptionRowsByConversationId(@Param("conversationId") Long conversationId);

    @Modifying(flushAutomatically = true)
    @Query(value = "DELETE FROM polls WHERE conversation_id = :conversationId", nativeQuery = true)
    int deletePollRowsByConversationId(@Param("conversationId") Long conversationId);

    @Modifying(flushAutomatically = true)
    @Query(value = "DELETE FROM poll_votes WHERE poll_id IN "
            + "(SELECT id FROM polls WHERE conversation_id = :conversationId AND creator_id = :senderId)",
            nativeQuery = true)
    int deletePollVoteRowsByConversationIdAndCreator(
            @Param("conversationId") Long conversationId,
            @Param("senderId") Long senderId);

    @Modifying(flushAutomatically = true)
    @Query(value = "DELETE FROM poll_options WHERE poll_id IN "
            + "(SELECT id FROM polls WHERE conversation_id = :conversationId AND creator_id = :senderId)",
            nativeQuery = true)
    int deletePollOptionRowsByConversationIdAndCreator(
            @Param("conversationId") Long conversationId,
            @Param("senderId") Long senderId);

    @Modifying(flushAutomatically = true)
    @Query(value = "DELETE FROM polls WHERE conversation_id = :conversationId AND creator_id = :senderId",
            nativeQuery = true)
    int deletePollRowsByConversationIdAndCreator(
            @Param("conversationId") Long conversationId,
            @Param("senderId") Long senderId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM Message m WHERE m.conversation.id = :conversationId")
    int deleteMessageRowsByConversationId(@Param("conversationId") Long conversationId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM Message m WHERE m.conversation.id = :conversationId AND m.sender.id = :senderId")
    int deleteMessageRowsByConversationIdAndSenderId(
            @Param("conversationId") Long conversationId,
            @Param("senderId") Long senderId);

    /**
     * Bulk JPQL bypasses ElementCollection cascades, so mention rows must go first.
     * Keep this wrapper as the public operation used by conversation cleanup.
     */
    @Transactional
    default void deleteByConversationIdBulk(Long conversationId) {
        deleteMentionRowsByConversationId(conversationId);
        deleteReactionRowsByConversationId(conversationId);
        deletePollVoteRowsByConversationId(conversationId);
        deletePollOptionRowsByConversationId(conversationId);
        deletePollRowsByConversationId(conversationId);
        deleteMessageRowsByConversationId(conversationId);
    }

    /** Same ordering as {@link #deleteByConversationIdBulk(Long)}, scoped to one sender. */
    @Transactional
    default void deleteByConversationIdAndSenderIdBulk(Long conversationId, Long senderId) {
        deleteMentionRowsByConversationIdAndSenderId(conversationId, senderId);
        deleteReactionRowsByConversationIdAndSenderId(conversationId, senderId);
        deletePollVoteRowsByConversationIdAndCreator(conversationId, senderId);
        deletePollOptionRowsByConversationIdAndCreator(conversationId, senderId);
        deletePollRowsByConversationIdAndCreator(conversationId, senderId);
        deleteMessageRowsByConversationIdAndSenderId(conversationId, senderId);
    }


    /**
     * Whether this triggering message has already been answered.
     *
     * Checked BEFORE inserting rather than relying on the unique index to reject a
     * duplicate: catching a constraint violation inside a transaction does not undo
     * the rollback-only mark JPA has already set, so the commit fails afterwards
     * with UnexpectedRollbackException and the "quietly ignore duplicates" path
     * never actually worked. The index is still the guarantee against a race; this
     * is what keeps the ordinary case from ever reaching it.
     */
    boolean existsByRespondsToMessageId(Long respondsToMessageId);
}
