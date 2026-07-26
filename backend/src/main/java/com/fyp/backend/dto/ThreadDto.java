package com.fyp.backend.dto;

import lombok.Data;
import lombok.Builder;

import java.time.LocalDateTime;

@Data
@Builder
public class ThreadDto {
    private Long id;
    private String title;
    private String content;
    private LocalDateTime createdAt;
    private Long createdById;
    private String createdByName;
    // Raw components so the client can order the name per its display language
    // (Chinese shows family name first). createdByName stays for backward-compat.
    private String createdByFirstName;
    private String createdByLastName;
    private boolean reported;
}
