package com.fyp.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One emoji's tally on a message: the emoji, how many, and whether the reader
 * is among them.
 *
 * {@code mine} is null on a broadcast. One broadcast reaches every member of a
 * conversation, so it cannot say "you reacted" to anyone in particular; the
 * client keeps what it already knows about its own reactions when it merges
 * such an update. A history page and a toggle response are built for one
 * reader, and there it is true or false.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ReactionSummaryDto {
    private String emoji;
    private long count;
    private Boolean mine;
}
