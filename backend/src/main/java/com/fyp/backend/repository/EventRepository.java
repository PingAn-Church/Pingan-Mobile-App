package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.fyp.backend.model.Event;

import jakarta.persistence.LockModeType;

public interface EventRepository extends JpaRepository<Event, Long>, JpaSpecificationExecutor<Event> {
    @Query("SELECT DISTINCT e FROM Event e JOIN e.checkedInUserIds userId WHERE userId = :userId")
    List<Event> findByCheckedInUserId(@Param("userId") Long userId);

    @Query("SELECT COUNT(e) FROM Event e JOIN e.checkedInUserIds userId WHERE userId = :userId")
    long countByCheckedInUserId(@Param("userId") Long userId);

    /**
     * The event row, locked for the rest of the transaction. Registration counts
     * and inserts under this lock, so two people taking the last place at once
     * are served one after the other instead of both fitting.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM Event e WHERE e.id = :id")
    Optional<Event> findByIdForUpdate(@Param("id") Long id);
}
