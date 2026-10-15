package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.fyp.backend.model.ConversationPin;

public interface ConversationPinRepository extends JpaRepository<ConversationPin, Long> {

    Optional<ConversationPin> findByUserIdAndConversationIdAndConversationType(
            Long userId, Long conversationId, String conversationType);

    /** Every pin one person holds: one query decorates their whole chat list. */
    List<ConversationPin> findByUserId(Long userId);
}
