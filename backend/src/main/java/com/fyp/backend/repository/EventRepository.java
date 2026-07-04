package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.fyp.backend.model.Event;

public interface EventRepository extends JpaRepository<Event, Long> {
    @Query("SELECT DISTINCT e FROM Event e JOIN e.checkedInUserIds userId WHERE userId = :userId")
    List<Event> findByCheckedInUserId(@Param("userId") Long userId);

    @Query("SELECT COUNT(e) FROM Event e JOIN e.checkedInUserIds userId WHERE userId = :userId")
    long countByCheckedInUserId(@Param("userId") Long userId);
}
