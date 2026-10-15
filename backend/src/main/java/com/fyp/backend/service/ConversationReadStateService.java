package com.fyp.backend.service;

import java.util.HashMap;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.ConversationReadState;
import com.fyp.backend.repository.ConversationReadStateRepository;
import com.fyp.backend.repository.MessageRepository;

import lombok.RequiredArgsConstructor;

/**
 * Moves and clears read watermarks.
 *
 * One number per person per conversation answers "what is unread here", so the
 * chat list costs a range count instead of a per-message existence check against
 * a table with a row for every member of every group. The same numbers answer
 * "who has read this" in a group: everyone whose watermark has passed the message.
 */
@Service
@RequiredArgsConstructor
public class ConversationReadStateService {

    private final ConversationReadStateRepository readStateRepository;
    private final MessageRepository messageRepository;

    /**
     * Marks everything currently in the conversation as read for this person.
     *
     * @return the watermark now in place when this call moved it, or null when
     *         there was nothing to move — an empty conversation, or a position
     *         already read. Callers announce a move; staying put is silent.
     */
    @Transactional
    public Long markRead(Long conversationId, Long userId) {
        if (conversationId == null || userId == null) return null;
        Long newest = messageRepository.findNewestMessageId(conversationId);
        if (newest == null) return null;
        Long current = readStateRepository.findByConversationIdAndUserId(conversationId, userId)
                .map(ConversationReadState::getLastReadMessageId)
                .orElse(null);
        if (current != null && current >= newest) return null;
        readStateRepository.advanceWatermark(conversationId, userId, newest);
        return newest;
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

    /**
     * Every member's watermark in a conversation: user id (as a string, for JSON)
     * → id of the last message they have read. Members who never opened it are
     * absent, which reads the same as "nothing read".
     */
    public Map<String, Long> watermarks(Long conversationId) {
        Map<String, Long> watermarks = new HashMap<>();
        for (ConversationReadState state : readStateRepository.findByConversationId(conversationId)) {
            if (state.getLastReadMessageId() != null) {
                watermarks.put(String.valueOf(state.getUserId()), state.getLastReadMessageId());
            }
        }
        return watermarks;
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
