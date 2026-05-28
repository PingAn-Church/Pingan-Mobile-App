package com.fyp.backend.repository;

import com.fyp.backend.model.Thread;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ThreadRepository extends JpaRepository<Thread, Long> {
    // Inherits basic CRUD methods like findAll(), save(), delete(), etc.
}
