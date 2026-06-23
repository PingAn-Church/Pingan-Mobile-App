package com.fyp.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.fyp.backend.model.UserAchievement;

public interface UserAchievementRepository extends JpaRepository<UserAchievement, Long> {

    List<UserAchievement> findByUserId(Long userId);

    boolean existsByUserIdAndAchievementId(Long userId, Long achievementId);

    void deleteByUserId(Long userId);
}
