package com.fyp.backend.service;

import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.Conversation;
import com.fyp.backend.model.ConversationMute;
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.PrivateConversationRepository;

import lombok.RequiredArgsConstructor;

/**
 * Per-user, per-conversation push-notification mutes. Muting silences pushes for
 * that conversation (see PushNotificationService) and keeps it out of the app-wide
 * unread badge; message delivery, the conversation's own unread count in the chat
 * list, and every other conversation's notifications are untouched.
 */
@Service
@RequiredArgsConstructor
public class ConversationMuteService {

    private final ConversationMuteRepository conversationMuteRepository;
    private final GroupConversationRepository groupConversationRepository;
    private final PrivateConversationRepository privateConversationRepository;

    public boolean isMuted(Long userId, Long conversationId, String conversationType) {
        return conversationMuteRepository
                .findByUserIdAndConversationIdAndConversationType(userId, conversationId, conversationType)
                .isPresent();
    }

    /** Idempotent mute/unmute; only participants may mute a conversation. */
    @Transactional
    public void setMuted(Long userId, Long conversationId, String conversationType, boolean muted) {
        requireParticipant(userId, conversationId, conversationType);
        Optional<ConversationMute> existing = conversationMuteRepository
                .findByUserIdAndConversationIdAndConversationType(userId, conversationId, conversationType);
        if (muted && existing.isEmpty()) {
            conversationMuteRepository.save(new ConversationMute(userId, conversationId, conversationType));
        } else if (!muted && existing.isPresent()) {
            conversationMuteRepository.delete(existing.get());
        }
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
