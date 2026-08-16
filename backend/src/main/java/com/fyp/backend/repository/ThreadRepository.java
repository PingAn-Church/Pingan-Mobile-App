package com.fyp.backend.repository;

import com.fyp.backend.model.Thread;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;

@Repository
public interface ThreadRepository extends JpaRepository<Thread, Long> {

    /** Guards cleanup: a cover picture still attached to a thread must not be deleted. */
    boolean existsByCoverImageContaining(String fragment);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM Thread t WHERE t.id = :id")
    Optional<Thread> findByIdForUpdate(@Param("id") Long id);

    // Inherits basic CRUD methods like findAll(), save(), delete(), etc.

    // Threads authored by a user; deleting each cascades its replies (orphanRemoval).
    List<Thread> findByCreatedById(Long userId);

    long countByCreatedById(Long userId);
}
