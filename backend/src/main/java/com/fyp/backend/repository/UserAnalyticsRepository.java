package com.fyp.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.fyp.backend.model.UserAnalytics;

public interface UserAnalyticsRepository extends JpaRepository<UserAnalytics, Long> {

    Optional<UserAnalytics> findByUserIdAndActivityDate(Long userId, String activityDate);

    @Query("select coalesce(sum(a.minutesSpent), 0) from UserAnalytics a where a.userId = :userId")
    long sumMinutesByUserId(@Param("userId") Long userId);

    void deleteByUserId(Long userId);
}
