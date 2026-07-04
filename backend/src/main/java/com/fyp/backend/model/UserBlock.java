package com.fyp.backend.model;

import java.sql.Timestamp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One user blocking another (directional). Private messaging is disabled while
 * a block exists in EITHER direction — unblocking on one side is not enough if
 * the other side still has their block in place.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "user_blocks", uniqueConstraints = @UniqueConstraint(columnNames = { "blocker_id", "blocked_id" }))
public class UserBlock {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "blocker_id", nullable = false)
    private Long blockerId;

    @Column(name = "blocked_id", nullable = false)
    private Long blockedId;

    private Timestamp createdAt;

    public UserBlock(Long blockerId, Long blockedId) {
        this.blockerId = blockerId;
        this.blockedId = blockedId;
        this.createdAt = new Timestamp(System.currentTimeMillis());
    }
}
