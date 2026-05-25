package com.fyp.backend.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class ReadReceiptDto {

    private Long messageId;  // The ID of the message being marked as read
    private Long userId;     // The ID of the user marking the message as read

    public ReadReceiptDto(Long messageId, Long userId) {
        this.messageId = messageId;
        this.userId = userId;
    }
}
