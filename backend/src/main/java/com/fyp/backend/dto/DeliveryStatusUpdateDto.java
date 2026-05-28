package com.fyp.backend.dto;

import lombok.Data;
import java.util.Map;

@Data
public class DeliveryStatusUpdateDto {

    private Long messageId;
    private Long conversationId;
    private Long senderId;
    private String conversationType;
    private Map<String, String> deliveryStatus;  // Key: UserId (String), Value: Status
}
