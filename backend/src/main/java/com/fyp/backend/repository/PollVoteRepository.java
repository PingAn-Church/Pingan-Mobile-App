package com.fyp.backend.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.PollVote;

@Repository
public interface PollVoteRepository extends JpaRepository<PollVote, Long> {

    List<PollVote> findByPollIdAndUserId(Long pollId, Long userId);

    /** Votes per option across a page of polls, as [optionId, count] rows. */
    @Query("SELECT v.optionId, COUNT(v) FROM PollVote v WHERE v.pollId IN :pollIds GROUP BY v.optionId")
    List<Object[]> countByOptionForPolls(@Param("pollIds") Collection<Long> pollIds);

    /** People who voted at all, per poll, as [pollId, count] rows. */
    @Query("SELECT v.pollId, COUNT(DISTINCT v.userId) FROM PollVote v WHERE v.pollId IN :pollIds GROUP BY v.pollId")
    List<Object[]> countVotersForPolls(@Param("pollIds") Collection<Long> pollIds);

    /** The viewer's own choices across a page, as [pollId, optionId] rows. */
    @Query("SELECT v.pollId, v.optionId FROM PollVote v WHERE v.userId = :userId AND v.pollId IN :pollIds")
    List<Object[]> findMine(@Param("userId") Long userId, @Param("pollIds") Collection<Long> pollIds);

    /** Who chose an option, oldest first. */
    @Query("SELECT v.userId FROM PollVote v WHERE v.optionId = :optionId ORDER BY v.id")
    List<Long> findUserIdsByOptionId(@Param("optionId") Long optionId, Pageable pageable);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM PollVote v WHERE v.optionId = :optionId")
    int deleteByOptionId(@Param("optionId") Long optionId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM PollVote v WHERE v.pollId = :pollId")
    int deleteByPollId(@Param("pollId") Long pollId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM PollVote v WHERE v.userId = :userId")
    int deleteByUserId(@Param("userId") Long userId);

    /** Votes cast on a departing account's sign-up entries, ahead of deleting the entries. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "DELETE FROM poll_votes WHERE option_id IN "
            + "(SELECT id FROM poll_options WHERE created_by_id = :userId)", nativeQuery = true)
    int deleteByOptionCreatedBy(@Param("userId") Long userId);
}
