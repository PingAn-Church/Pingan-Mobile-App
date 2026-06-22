package com.fyp.backend.repository;

import com.fyp.backend.model.Message;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findByConversationId(Long conversationId);
    List<Message> findByConversationIdAndType(Long conversationId, String type);

    // Cursor (keyset) pagination, newest-first. The first page omits `before`;
    // subsequent pages pass the smallest id seen so far to fetch older messages.
    List<Message> findByConversationIdOrderByIdDesc(Long conversationId, Pageable pageable);
    List<Message> findByConversationIdAndIdLessThanOrderByIdDesc(Long conversationId, Long beforeId, Pageable pageable);

    // Unread = messages from other people in this conversation not yet READ by the user.
    @Query("SELECT COUNT(m) FROM Message m WHERE m.conversation.id = :conversationId AND m.sender.id <> :userId "
            + "AND NOT EXISTS (SELECT 1 FROM MessageDeliveryStatus ds WHERE ds.message.id = m.id "
            + "AND ds.user.id = :userId AND ds.status = 'READ')")
    long countUnread(@Param("conversationId") Long conversationId, @Param("userId") Long userId);

    void deleteById(Long messageId);
}
