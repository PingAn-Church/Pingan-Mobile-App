package com.fyp.backend.mq;

import java.util.ArrayList;
import java.util.List;

import com.fyp.backend.dto.MessageDto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A small, durable unit of post-commit WebSocket or push work. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FanoutTask {

    public static final String CHAT_BROADCAST = "CHAT_BROADCAST";
    public static final String PUSH_BATCH = "PUSH_BATCH";
    public static final String ASSISTANT_REPLY = "ASSISTANT_REPLY";

    private String kind;
    private MessageDto message;

    /**
     * ASSISTANT_REPLY carries ids only, and the worker re-reads from the database.
     *
     * Unlike CHAT_BROADCAST, which ships a whole MessageDto, this has to survive
     * being redelivered: re-reading means a retry sees the same rows and produces
     * the same answer, and it means a question deleted before the worker ran is
     * simply skipped rather than answered from a stale copy.
     */
    private Long triggerMessageId;
    private Long askerId;

    @Builder.Default
    private List<Long> recipientIds = new ArrayList<>();

    private String titleEn;
    private String titleZh;
    private String bodyEn;
    private String bodyZh;
    private Long conversationId;
    private String conversationType;
    private Long threadId;
    private boolean respectMute;
}
