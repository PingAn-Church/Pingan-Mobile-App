package com.fyp.backend.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.EventRegistration;

@Repository
public interface EventRegistrationRepository extends JpaRepository<EventRegistration, Long> {

    Optional<EventRegistration> findByEventIdAndUserId(Long eventId, Long userId);

    boolean existsByEventIdAndUserId(Long eventId, Long userId);

    long countByEventId(Long eventId);

    /** Oldest first: the order people signed up in. */
    List<EventRegistration> findByEventIdOrderByCreatedAtAscIdAsc(Long eventId);

    /** Head counts for a page of events, as [eventId, count] rows. */
    @Query("SELECT r.eventId, COUNT(r) FROM EventRegistration r WHERE r.eventId IN :eventIds GROUP BY r.eventId")
    List<Object[]> countByEventIds(@Param("eventIds") Collection<Long> eventIds);

    /** Which of these events the viewer has registered for. */
    @Query("SELECT r.eventId FROM EventRegistration r WHERE r.userId = :userId AND r.eventId IN :eventIds")
    List<Long> findRegisteredEventIds(@Param("userId") Long userId, @Param("eventIds") Collection<Long> eventIds);

    /**
     * Registrations owed a reminder: the event takes sign-ups, starts inside
     * (now, until], and this person has not been told yet. A theta join because
     * the registration holds a plain event id rather than an association.
     */
    @Query("SELECT r FROM EventRegistration r, Event e "
            + "WHERE e.id = r.eventId "
            + "AND e.registrationEnabled = TRUE "
            + "AND e.startAt > :now AND e.startAt <= :until "
            + "AND r.reminderSentAt IS NULL "
            + "ORDER BY r.eventId, r.id")
    List<EventRegistration> findDueReminders(@Param("now") Instant now, @Param("until") Instant until);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE EventRegistration r SET r.reminderSentAt = :sentAt WHERE r.id IN :ids AND r.reminderSentAt IS NULL")
    int markReminded(@Param("ids") Collection<Long> ids, @Param("sentAt") Instant sentAt);

    /** A rescheduled event reminds everybody again at its new time. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE EventRegistration r SET r.reminderSentAt = NULL WHERE r.eventId = :eventId")
    int clearReminders(@Param("eventId") Long eventId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM EventRegistration r WHERE r.eventId = :eventId")
    int deleteByEventId(@Param("eventId") Long eventId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM EventRegistration r WHERE r.userId = :userId")
    int deleteByUserId(@Param("userId") Long userId);
}
