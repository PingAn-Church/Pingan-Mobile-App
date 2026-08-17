package com.fyp.backend.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.repository.ConversationReadStateRepository;
import com.fyp.backend.repository.MessageRepository;

import lombok.RequiredArgsConstructor;

/**
 * Moves and clears read watermarks.
 *
 * One number per person per conversation answers "what is unread here", so the
 * chat list costs a range count instead of a per-message existence check against
 * a table with a row for every member of every group.
 */
@Service
@RequiredArgsConstructor
public class ConversationReadStateService {

    private final ConversationReadStateRepository readStateRepository;
    private final MessageRepository messageRepository;

    /** Marks everything currently in the conversation as read for this person. */
    @Transactional
    public void markRead(Long conversationId, Long userId) {
        if (conversationId == null || userId == null) return;
        setWatermark(conversationId, userId, messageRepository.findNewestMessageId(conversationId));
    }

    /**
     * Starts somebody who has just joined at the current end of the conversation.
     *
     * Without this, a new member's first sight of a group is every message ever
     * posted in it, marked unread — which in the church-wide group is the entire
     * history. Joining a conversation is not the same as having missed it.
     */
    @Transactional
    public void markCaughtUp(Long conversationId, Long userId) {
        markRead(conversationId, userId);
    }

    private void setWatermark(Long conversationId, Long userId, Long messageId) {
        if (messageId == null) return;
        readStateRepository.advanceWatermark(conversationId, userId, messageId);
    }

    @Transactional
    public void forget(Long conversationId, Long userId) {
        readStateRepository.deleteByConversationIdAndUserId(conversationId, userId);
    }

    @Transactional
    public void forgetConversation(Long conversationId) {
        readStateRepository.deleteByConversationId(conversationId);
    }

    @Transactional
    public void forgetUser(Long userId) {
        readStateRepository.deleteByUserId(userId);
    }
}
