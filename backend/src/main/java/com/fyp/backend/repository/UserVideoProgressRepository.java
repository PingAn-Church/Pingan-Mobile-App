package com.fyp.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fyp.backend.model.UserVideoProgress;

@Repository
public interface UserVideoProgressRepository extends JpaRepository<UserVideoProgress, Long> {
    Optional<UserVideoProgress> findByUserIdAndVideoId(Long userId, Long videoId);

    List<UserVideoProgress> findByUserIdAndVideoIdIn(Long userId, List<Long> videoIds);

    long countByUserIdAndVideoIdInAndIsCompletedTrue(Long userId, List<Long> videoIds);

    void deleteByVideoIdIn(List<Long> videoIds);

    void deleteByUserId(Long userId);
}
