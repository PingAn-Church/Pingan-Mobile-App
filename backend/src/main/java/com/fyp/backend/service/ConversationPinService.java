package com.fyp.backend.service;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.Conversation;
import com.fyp.backend.model.ConversationPin;
import com.fyp.backend.repository.ConversationPinRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.PrivateConversationRepository;

import lombok.RequiredArgsConstructor;

/**
 * Per-user, per-conversation "pin to top". A pinned conversation sits above the
 * rest of that person's chat list however quiet it is; it still sorts by recency
 * among the other pinned ones. Nothing else — unread counts, notifications, the
 * conversation itself — is affected, and the pin is invisible to everyone else.
 * The twin of {@link ConversationMuteService}, down to the participant check.
 */
@Service
@RequiredArgsConstructor
public class ConversationPinService {

    private final ConversationPinRepository conversationPinRepository;
    private final GroupConversationRepository groupConversationRepository;
    private final PrivateConversationRepository privateConversationRepository;

    public boolean isPinned(Long userId, Long conversationId, String conversationType) {
        return conversationPinRepository
                .findByUserIdAndConversationIdAndConversationType(userId, conversationId, conversationType)
                .isPresent();
    }

    /** Idempotent pin/unpin; only participants may pin a conversation. */
    @Transactional
    public void setPinned(Long userId, Long conversationId, String conversationType, boolean pinned) {
        requireParticipant(userId, conversationId, conversationType);
        Optional<ConversationPin> existing = conversationPinRepository
                .findByUserIdAndConversationIdAndConversationType(userId, conversationId, conversationType);
        if (pinned && existing.isEmpty()) {
            conversationPinRepository.save(new ConversationPin(userId, conversationId, conversationType));
        } else if (!pinned && existing.isPresent()) {
            conversationPinRepository.delete(existing.get());
        }
    }

    /**
     * When this person pinned each conversation they have pinned, keyed by
     * conversation id (ids are unique across group and private conversations).
     * One query for the whole chat list.
     */
    public Map<Long, Long> pinnedAtByConversation(Long userId) {
        Map<Long, Long> pinnedAt = new HashMap<>();
        for (ConversationPin pin : conversationPinRepository.findByUserId(userId)) {
            pinnedAt.put(pin.getConversationId(),
                    pin.getCreatedAt() == null ? 0L : pin.getCreatedAt().getTime());
        }
        return pinnedAt;
    }

    private void requireParticipant(Long userId, Long conversationId, String conversationType) {
        Conversation conversation;
        if ("group".equals(conversationType)) {
            conversation = groupConversationRepository.findById(conversationId)
                    .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));
        } else if ("private".equals(conversationType)) {
            conversation = privateConversationRepository.findById(conversationId)
                    .orElseThrow(() -> new IllegalArgumentException("Private conversation not found"));
        } else {
            throw new IllegalArgumentException("Invalid conversation type");
        }
        boolean participant = conversation.getParticipants().stream()
                .anyMatch(user -> user.getId().equals(userId));
        if (!participant) {
            throw new IllegalArgumentException("User is not part of this conversation");
        }
    }
}
