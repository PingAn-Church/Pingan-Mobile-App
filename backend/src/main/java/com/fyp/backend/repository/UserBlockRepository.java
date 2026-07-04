package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.fyp.backend.model.UserBlock;

public interface UserBlockRepository extends JpaRepository<UserBlock, Long> {
    boolean existsByBlockerIdAndBlockedId(Long blockerId, Long blockedId);

    Optional<UserBlock> findByBlockerIdAndBlockedId(Long blockerId, Long blockedId);

    List<UserBlock> findAllByBlockerId(Long blockerId);

    // Account hard-delete sweep: drop every block row the user appears in.
    long countByBlockerIdOrBlockedId(Long blockerId, Long blockedId);

    void deleteByBlockerIdOrBlockedId(Long blockerId, Long blockedId);
}
