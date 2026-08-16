package com.fyp.backend.repository;

import com.fyp.backend.model.ThreadReply;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;

@Repository
public interface ThreadReplyRepository extends JpaRepository<ThreadReply, Long> {

    /** Guards cleanup: a picture still attached to a reply must not be deleted. */
    boolean existsByImageUrlContaining(String fragment);

    /** Newest reply in a topic — the read marker a subscription is set to. */
    java.util.Optional<ThreadReply> findTopByThreadIdOrderByIdDesc(Long threadId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ThreadReply r WHERE r.id = :id")
    Optional<ThreadReply> findByIdForUpdate(@Param("id") Long id);

    List<ThreadReply> findByThreadId(Long threadId);

    @Query("SELECT r.id FROM ThreadReply r WHERE r.thread.id = :threadId")
    List<Long> findIdsByThreadId(@Param("threadId") Long threadId);

    List<ThreadReply> findByThreadIdOrderByIdAsc(Long threadId, Pageable pageable);

    List<ThreadReply> findByThreadIdAndIdGreaterThanOrderByIdAsc(Long threadId, Long afterId, Pageable pageable);

    long countByAuthorId(Long userId);

    // Account-deletion cleanup: replies a user posted on threads owned by others.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM ThreadReply r WHERE r.author.id = :userId")
    void deleteByAuthorId(@Param("userId") Long userId);
}
