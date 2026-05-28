package com.fyp.backend.service;

import com.fyp.backend.model.RefreshToken;
import com.fyp.backend.repository.RefreshTokenRepository;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Optional;

@Transactional
@Service
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;

    @Autowired
    public RefreshTokenService(RefreshTokenRepository refreshTokenRepository) {
        this.refreshTokenRepository = refreshTokenRepository;
    }

//    public void saveRefreshToken(String email, String deviceId, String refreshToken, long expirationMillis) {
//        String hashedToken = hashToken(refreshToken);
//        Instant now = Instant.now();
//
//        RefreshToken tokenEntity = RefreshToken.builder()
//                .userEmail(email)
//                .deviceId(deviceId)
//                .refreshTokenHash(hashedToken)
//                .createdAt(now)
//                .expiresAt(now.plusMillis(expirationMillis))
//                .build();
//
//        refreshTokenRepository.save(tokenEntity);
//    }

    public void saveRefreshToken(String email, String deviceId, String refreshToken, long expirationMillis) {
        // 1. Delete any old token for same email + device
        refreshTokenRepository.deleteByUserEmailAndDeviceId(email, deviceId);

        // 2. Save new refresh token
        String hashedToken = hashToken(refreshToken);
        Instant now = Instant.now();

        RefreshToken tokenEntity = RefreshToken.builder()
                .userEmail(email)
                .deviceId(deviceId)
                .refreshTokenHash(hashedToken)
                .createdAt(now)
                .expiresAt(now.plusMillis(expirationMillis))
                .build();

        refreshTokenRepository.save(tokenEntity);
    }


    public boolean validateRefreshToken(String email, String deviceId, String incomingToken) {
        Optional<RefreshToken> optionalToken = refreshTokenRepository.findByUserEmailAndDeviceId(email, deviceId);

        if (optionalToken.isEmpty()) {
            return false;
        }

        RefreshToken tokenEntity = optionalToken.get();

        if (tokenEntity.getExpiresAt().isBefore(Instant.now())) {
            return false;
        }

        String incomingHashed = hashToken(incomingToken);

        return tokenEntity.getRefreshTokenHash().equals(incomingHashed);
    }

    public void deleteRefreshToken(String email, String deviceId) {
        refreshTokenRepository.deleteByUserEmailAndDeviceId(email, deviceId);
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashedBytes = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hashedBytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 Algorithm not available", e);
        }
    }
}
