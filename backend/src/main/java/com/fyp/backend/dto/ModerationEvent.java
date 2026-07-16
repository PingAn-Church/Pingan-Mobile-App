package com.fyp.backend.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ModerationEvent {
    public static final String EVENT_TYPE = "CONTENT_MODERATION";
    public static final String STATE_PENDING = "PENDING";
    public static final String STATE_RESTORED = "RESTORED";
    public static final String STATE_DELETED = "DELETED";

    @Builder.Default
    private String eventType = EVENT_TYPE;
    private String contentType;
    private Long contentId;
    private String state;
    private Long conversationId;
    private String conversationType;
    private Long threadId;
    private Long courseId;
}
