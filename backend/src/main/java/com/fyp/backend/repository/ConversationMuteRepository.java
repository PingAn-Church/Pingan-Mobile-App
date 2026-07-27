package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.fyp.backend.model.ConversationMute;

public interface ConversationMuteRepository extends JpaRepository<ConversationMute, Long> {

    Optional<ConversationMute> findByUserIdAndConversationIdAndConversationType(
            Long userId, Long conversationId, String conversationType);

    List<ConversationMute> findByConversationIdAndConversationType(
            Long conversationId, String conversationType);

    List<ConversationMute> findByUserId(Long userId);
}
