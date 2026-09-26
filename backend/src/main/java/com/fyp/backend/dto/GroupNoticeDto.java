package com.fyp.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A group's pinned message, as the banner above the chat draws it.
 *
 * {@code message} is the pinned message itself, filtered for the reader the
 * same way a quote is (a reported original is hidden). {@code noticeMessageId}
 * is the "📌" line the pin posted into the chat: what the banner jumps to, and
 * the point members must have read past to count as having seen the notice.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class GroupNoticeDto {
    private Long messageId;
    private Long noticeMessageId;
    private ReplyPreviewDto message;
    /** Epoch milliseconds. */
    private Long pinnedAt;
    private Long pinnedById;
    private String pinnedByFirstName;
    private String pinnedByLastName;
}
