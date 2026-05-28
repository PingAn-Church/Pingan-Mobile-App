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
}
