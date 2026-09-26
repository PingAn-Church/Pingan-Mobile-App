package com.fyp.backend.dto;

import java.time.Instant;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One row of an event's registrant list. Email is filled in for admins only;
 * everyone else who is allowed to see the list gets names and faces.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class EventRegistrantDto {
    private Long id;
    private String firstName;
    private String lastName;
    private String profileImage;
    private String email;
    private Instant registeredAt;
    private boolean checkedIn;
}
