package com.fyp.backend.dto;

import lombok.Data;
import lombok.Builder;

import java.time.LocalDateTime;

@Data
@Builder
public class ThreadReplyDto {
    private Long id;
    private String content;
    // Stored object path for the optional attached picture.
    private String imageUrl;
    private LocalDateTime createdAt;
    private Long threadId;
    private Long authorId;
    private String authorName;
    // Raw components so the client can order the name per its display language
    // (Chinese shows family name first). authorName stays for backward-compat.
    private String authorFirstName;
    private String authorLastName;
    private boolean reported;
}
