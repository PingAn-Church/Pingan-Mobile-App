package com.fyp.backend.dto;

import lombok.Data;
import lombok.Builder;

import java.time.LocalDateTime;

@Data
@Builder
public class ThreadReplyDto {
    private Long id;
    private String content;
    private LocalDateTime createdAt;
    private Long threadId;
    private Long authorId;
    private String authorName;
}
