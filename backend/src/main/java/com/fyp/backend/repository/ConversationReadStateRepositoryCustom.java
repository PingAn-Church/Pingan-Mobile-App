package com.fyp.backend.repository;

public interface ConversationReadStateRepositoryCustom {

    /** Atomically advances a read watermark and never moves it backwards. */
    int advanceWatermark(Long conversationId, Long userId, Long messageId);
}
