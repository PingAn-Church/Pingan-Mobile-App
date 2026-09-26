package com.fyp.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One option as drawn on the card: its text (null on a sign-up entry, which
 * is shown as the person's own name), the person behind a sign-up entry, and
 * how many chose it. Who chose it is a separate request, never in the page.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class PollOptionDto {
    private Long id;
    private String text;
    private String note;
    private int position;
    private Long createdById;
    private String createdByFirstName;
    private String createdByLastName;
    private boolean createdByBot;
    private String createdByDisplayNameZh;
    private long count;
}
