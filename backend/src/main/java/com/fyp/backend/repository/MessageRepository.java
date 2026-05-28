package com.fyp.backend.repository;

import com.fyp.backend.model.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {
//    List<Message> findByConversationIdAndType(Long conversationId, String type);
    List<Message> findByConversationId(Long conversationId);
    List<Message> findByConversationIdAndType(Long conversationId, String type);

    void deleteById(Long messageId);
}
