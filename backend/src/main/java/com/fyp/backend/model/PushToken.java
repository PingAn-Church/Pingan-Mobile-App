package com.fyp.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "push_tokens")
@Data
@NoArgsConstructor
public class PushToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;  // The user associated with this token

    @Column(nullable = false)
    private String token;  // The push notification token

    @Column(nullable = false)
    private String deviceType;  // Device type (e.g., Android, iOS)

    @Column(nullable = false)
    private String deviceId;  // Device ID to uniquely identify each device

    @Column(nullable = false)
    private boolean isActive = true;  // Whether the token is active or not
}
