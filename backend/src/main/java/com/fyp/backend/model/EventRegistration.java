package com.fyp.backend.model;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One person signed up for one event.
 *
 * A table of its own rather than another id list on {@link Event} (the way
 * check-ins are kept): the unique pair is what makes a double tap, or the same
 * share card pressed in two chats, register once; a capacity check needs a
 * count; and the reminder job needs a per-person "already told" marker.
 *
 * {@code reminderSentAt} is that marker. It is cleared when the event moves, so
 * a rescheduled event reminds everybody again at its new time.
 * PostgreSQL foreign keys for the scalar ids are installed by
 * DatabaseIntegrityMigration, so deleting an event or a user cascades here.
 */
@Entity
@Data
@NoArgsConstructor
@Table(name = "event_registrations", uniqueConstraints = {
        @UniqueConstraint(name = "uq_event_registration", columnNames = { "event_id", "user_id" })
}, indexes = {
        @Index(name = "idx_event_registrations_event", columnList = "event_id"),
        @Index(name = "idx_event_registrations_user", columnList = "user_id")
})
public class EventRegistration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "event_id", nullable = false)
    private Long eventId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "reminder_sent_at")
    private Instant reminderSentAt;

    public EventRegistration(Long eventId, Long userId, Instant createdAt) {
        this.eventId = eventId;
        this.userId = userId;
        this.createdAt = createdAt;
    }
}
