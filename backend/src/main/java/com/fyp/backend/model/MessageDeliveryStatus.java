package com.fyp.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.sql.Timestamp;

@Entity
@Data
@NoArgsConstructor
@Table(name = "message_delivery_status")
public class MessageDeliveryStatus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "message_id", nullable = false)
    private Message message;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String status;  // Possible values: "SENT", "DELIVERED", "READ"

    @Column(nullable = false)
    private Timestamp timestamp;

    public MessageDeliveryStatus(Message message, User user, String status, Timestamp timestamp) {
        this.message = message;
        this.user = user;
        this.status = status;
        this.timestamp = timestamp;
    }
}
