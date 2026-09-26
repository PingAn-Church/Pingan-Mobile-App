package com.fyp.backend.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.PollOption;

@Repository
public interface PollOptionRepository extends JpaRepository<PollOption, Long> {

    List<PollOption> findByPollIdOrderByPositionAscIdAsc(Long pollId);

    List<PollOption> findByPollIdInOrderByPositionAscIdAsc(Collection<Long> pollIds);

    long countByPollId(Long pollId);

    /** A person's own sign-up entry, if they have one. */
    Optional<PollOption> findByPollIdAndCreatedById(Long pollId, Long createdById);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM PollOption o WHERE o.pollId = :pollId")
    int deleteByPollId(@Param("pollId") Long pollId);

    /** Sign-up entries a departing account added. Their votes go first (PollVoteRepository). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM PollOption o WHERE o.createdById = :userId")
    int deleteByCreatedById(@Param("userId") Long userId);
}
