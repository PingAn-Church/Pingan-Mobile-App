package com.fyp.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.fyp.backend.model.ConversationMute;

public interface ConversationMuteRepository extends JpaRepository<ConversationMute, Long> {

    Optional<ConversationMute> findByUserIdAndConversationIdAndConversationType(
            Long userId, Long conversationId, String conversationType);

    @Query("SELECT cm.userId FROM ConversationMute cm "
            + "WHERE cm.conversationId = :conversationId "
            + "AND cm.conversationType = :conversationType "
            + "AND cm.userId IN :userIds")
    List<Long> findMutedUserIds(
            @Param("conversationId") Long conversationId,
            @Param("conversationType") String conversationType,
            @Param("userIds") Collection<Long> userIds);

    List<ConversationMute> findByUserId(Long userId);
}
