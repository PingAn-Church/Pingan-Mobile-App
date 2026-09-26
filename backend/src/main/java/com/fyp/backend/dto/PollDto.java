package com.fyp.backend.dto;

import java.util.ArrayList;
import java.util.List;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A poll as the card in the chat draws it.
 *
 * {@code myOptionIds} is what the reader chose. It is null on a broadcast — one
 * copy reaches every member, so it cannot say "yours" — and the client keeps
 * what it already knows, exactly as it does for reaction tallies. A history
 * page and a vote response are built for one reader and carry the real list.
 *
 * {@code closed} folds the two ways a poll ends (an early close, a deadline
 * passed) into the one thing the card needs to know.
 */
@Data
@NoArgsConstructor
public class PollDto {
    private Long id;
    private Long messageId;
    private Long creatorId;
    private String question;
    private String mode;
    private boolean anonymous;
    /** Epoch milliseconds, or null. */
    private Long deadline;
    private Integer maxEntries;
    private boolean closed;
    private Long closedAt;
    /** People who voted (or signed up) at all. */
    private long voterCount;
    private List<PollOptionDto> options = new ArrayList<>();
    private List<Long> myOptionIds;
}
