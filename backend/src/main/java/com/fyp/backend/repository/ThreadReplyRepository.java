package com.fyp.backend.repository;

import com.fyp.backend.model.ThreadReply;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ThreadReplyRepository extends JpaRepository<ThreadReply, Long> {
    List<ThreadReply> findByThreadId(Long threadId);

    List<ThreadReply> findByThreadIdOrderByIdAsc(Long threadId, Pageable pageable);

    List<ThreadReply> findByThreadIdAndIdGreaterThanOrderByIdAsc(Long threadId, Long afterId, Pageable pageable);

    long countByAuthorId(Long userId);

    // Account-deletion cleanup: replies a user posted on threads owned by others.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM ThreadReply r WHERE r.author.id = :userId")
    void deleteByAuthorId(@Param("userId") Long userId);
}
