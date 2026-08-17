package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.ThreadSubscription;

@Repository
public interface ThreadSubscriptionRepository extends JpaRepository<ThreadSubscription, Long> {

    Optional<ThreadSubscription> findByThreadIdAndUserId(Long threadId, Long userId);

    /** Who to notify about a new reply. */
    List<ThreadSubscription> findByThreadId(Long threadId);

    /** Which topics this person follows — drives the bell state in the list. */
    @Query("SELECT s.threadId FROM ThreadSubscription s WHERE s.userId = :userId")
    List<Long> findThreadIdsByUserId(@Param("userId") Long userId);

    /**
     * Replies this person has not seen in topics they follow, excluding their own.
     *
     * The correlated subquery reads each subscription's own read marker, so one
     * query covers every followed topic — which is what the Topics row in the
     * chat list needs, on every load.
     */
    @Query("SELECT COUNT(r) FROM ThreadReply r "
            + "WHERE r.author.id <> :userId "
            + "AND r.thread.id IN (SELECT s.threadId FROM ThreadSubscription s WHERE s.userId = :userId) "
            + "AND r.id > COALESCE((SELECT s2.lastSeenReplyId FROM ThreadSubscription s2 "
            + "WHERE s2.userId = :userId AND s2.threadId = r.thread.id), 0)")
    long countUnseenRepliesFor(@Param("userId") Long userId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM ThreadSubscription s WHERE s.threadId = :threadId")
    int deleteByThreadId(@Param("threadId") Long threadId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM ThreadSubscription s WHERE s.userId = :userId")
    int deleteByUserId(@Param("userId") Long userId);
}
