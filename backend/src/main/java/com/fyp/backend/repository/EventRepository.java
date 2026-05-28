package com.fyp.backend.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.fyp.backend.model.Event;

public interface EventRepository extends JpaRepository<Event, Long> {
}