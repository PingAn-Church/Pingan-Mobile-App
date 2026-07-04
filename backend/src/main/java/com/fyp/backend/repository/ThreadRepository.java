package com.fyp.backend.repository;

import com.fyp.backend.model.Thread;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ThreadRepository extends JpaRepository<Thread, Long> {
    // Inherits basic CRUD methods like findAll(), save(), delete(), etc.

    // Threads authored by a user; deleting each cascades its replies (orphanRemoval).
    List<Thread> findByCreatedById(Long userId);

    long countByCreatedById(Long userId);
}
