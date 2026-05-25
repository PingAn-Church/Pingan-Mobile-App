package com.fyp.backend.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class PrivateConversationDto {
    private Long conversationId;
    private Long participant1Id; // Typically the creator
    private Long participant2Id; // The other user
}
