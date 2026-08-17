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

    private String kind;
    private MessageDto message;

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
