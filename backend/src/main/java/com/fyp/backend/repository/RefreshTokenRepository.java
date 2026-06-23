package com.fyp.backend.repository;

import com.fyp.backend.model.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByUserEmailAndDeviceId(String userEmail, String deviceId);
    void deleteByUserEmailAndDeviceId(String userEmail, String deviceId);
    void deleteByUserEmail(String userEmail);
}
