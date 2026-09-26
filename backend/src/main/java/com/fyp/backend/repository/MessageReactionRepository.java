package com.fyp.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.MessageReaction;

@Repository
public interface MessageReactionRepository extends JpaRepository<MessageReaction, Long> {

    Optional<MessageReaction> findByMessageIdAndUserIdAndEmoji(Long messageId, Long userId, String emoji);

    /**
     * Counts for a page of messages, as [messageId, emoji, count] rows. Aggregated
     * in the database: a popular message in the app-level group can carry a few
     * hundred 🙏, and a history page must not haul every one of them down.
     */
    @Query("SELECT r.messageId, r.emoji, COUNT(r) FROM MessageReaction r "
            + "WHERE r.messageId IN :messageIds GROUP BY r.messageId, r.emoji")
    List<Object[]> countByMessageIds(@Param("messageIds") Collection<Long> messageIds);

    /** Which of these messages the viewer reacted to, and with what: [messageId, emoji] rows. */
    @Query("SELECT r.messageId, r.emoji FROM MessageReaction r "
            + "WHERE r.userId = :userId AND r.messageId IN :messageIds")
    List<Object[]> findMineByMessageIds(@Param("userId") Long userId,
            @Param("messageIds") Collection<Long> messageIds);

    /** Who reacted with this emoji, oldest first. */
    @Query("SELECT r.userId FROM MessageReaction r WHERE r.messageId = :messageId AND r.emoji = :emoji ORDER BY r.id")
    List<Long> findUserIds(@Param("messageId") Long messageId, @Param("emoji") String emoji, Pageable pageable);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM MessageReaction r WHERE r.messageId = :messageId")
    int deleteByMessageId(@Param("messageId") Long messageId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM MessageReaction r WHERE r.userId = :userId")
    int deleteByUserId(@Param("userId") Long userId);
}
