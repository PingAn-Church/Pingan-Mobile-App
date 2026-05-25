package com.fyp.backend.repository;

import com.fyp.backend.model.PushToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PushTokenRepository extends JpaRepository<PushToken, Long> {
    Optional<PushToken> findByUserIdAndTokenAndDeviceId(Long userId, String token, String deviceId);
    List<PushToken> findByUserIdAndDeviceId(Long userId, String deviceId);
    Optional<PushToken> findByUserIdAndToken(Long userId, String token);
    List<PushToken> findByUserId(Long userId);
    void deleteByUserIdAndToken(Long userId, String token);
    void deleteByUserIdAndTokenAndDeviceId(Long userId, String token, String deviceId);
}
