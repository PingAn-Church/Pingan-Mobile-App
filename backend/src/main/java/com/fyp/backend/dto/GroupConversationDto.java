package com.fyp.backend.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
public class GroupConversationDto {
    private Long conversationId;
    private String groupName;
    private String groupIcon;
    private List<Long> participants; // Optional: For creating group chats, list of participant IDs
}
