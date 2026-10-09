package com.fyp.backend.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import lombok.Data;
import lombok.NoArgsConstructor;

/** What the composer sends to POST /chat/polls. Validated in PollService.create. */
@Data
@NoArgsConstructor
public class CreatePollRequest {
    private Long conversationId;
    private String question;
    /** SINGLE, MULTI or SIGNUP. */
    private String mode;
    private boolean anonymous;
    private Instant deadline;
    /** SIGNUP only; null or 0 for no limit. */
    private Integer maxEntries;
    /** SINGLE/MULTI: 2–10 choices. Ignored for SIGNUP, whose entries are the people who join. */
    private List<String> options = new ArrayList<>();
}
