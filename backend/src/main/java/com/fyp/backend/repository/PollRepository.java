package com.fyp.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.Poll;

import jakarta.persistence.LockModeType;

@Repository
public interface PollRepository extends JpaRepository<Poll, Long> {

    Optional<Poll> findByMessageId(Long messageId);

    /** The polls behind a page of messages; most pages have none. */
    List<Poll> findByMessageIdIn(Collection<Long> messageIds);

    /**
     * The poll, locked for the rest of the transaction. Votes and sign-ups
     * check-then-write (one vote per person, a cap on entries), so two taps at
     * once are served one after the other instead of both fitting.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Poll p WHERE p.id = :id")
    Optional<Poll> findByIdForUpdate(@Param("id") Long id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM Poll p WHERE p.messageId = :messageId")
    int deleteByMessageId(@Param("messageId") Long messageId);
}
