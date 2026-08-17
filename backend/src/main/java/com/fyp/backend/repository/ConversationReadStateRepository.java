package com.fyp.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.ConversationReadState;

@Repository
public interface ConversationReadStateRepository extends JpaRepository<ConversationReadState, Long> {

    Optional<ConversationReadState> findByConversationIdAndUserId(Long conversationId, Long userId);

    long countByUserId(Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM ConversationReadState r WHERE r.conversationId = :conversationId AND r.userId = :userId")
    void deleteByConversationIdAndUserId(@Param("conversationId") Long conversationId,
            @Param("userId") Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM ConversationReadState r WHERE r.conversationId = :conversationId")
    void deleteByConversationId(@Param("conversationId") Long conversationId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM ConversationReadState r WHERE r.userId = :userId")
    void deleteByUserId(@Param("userId") Long userId);
}
