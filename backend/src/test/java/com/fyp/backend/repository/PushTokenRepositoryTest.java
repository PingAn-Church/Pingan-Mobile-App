package com.fyp.backend.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.TestPropertySource;

import com.fyp.backend.model.PushToken;
import com.fyp.backend.model.RefreshToken;
import com.fyp.backend.model.User;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@TestPropertySource(properties = "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect")
class PushTokenRepositoryTest {

    @Autowired private PushTokenRepository pushTokenRepository;
    @Autowired private RefreshTokenRepository refreshTokenRepository;
    @Autowired private UserRepository userRepository;

    @Test
    void bulkCleanupKeepsOnlyDevicesWithValidRefreshTokens() {
        User user = new User();
        user.setFirstName("Push");
        user.setLastName("User");
        user.setEmail("push@example.com");
        user.setPassword("hash");
        user.setActive(true);
        user = userRepository.save(user);

        PushToken valid = pushTokenRepository.save(pushToken(user, "valid-device", "valid-token"));
        PushToken stale = pushTokenRepository.save(pushToken(user, "stale-device", "stale-token"));

        RefreshToken refresh = RefreshToken.builder()
                .userEmail(user.getEmail())
                .deviceId("valid-device")
                .refreshTokenHash("refresh-hash")
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
        refreshTokenRepository.saveAndFlush(refresh);

        assertEquals(1, pushTokenRepository.deactivateWithoutValidRefreshToken(Instant.now()));
        assertTrue(pushTokenRepository.findById(valid.getId()).orElseThrow().isActive());
        assertFalse(pushTokenRepository.findById(stale.getId()).orElseThrow().isActive());
    }

    @Test
    void logoutBulkDeactivateOnlyTouchesMatchingUserDevice() {
        User user = new User();
        user.setFirstName("Push");
        user.setLastName("User");
        user.setEmail("logout@example.com");
        user.setPassword("hash");
        user.setActive(true);
        user = userRepository.save(user);

        PushToken matching = pushTokenRepository.save(pushToken(user, "device-1", "token-1"));
        PushToken otherDevice = pushTokenRepository.save(pushToken(user, "device-2", "token-2"));

        assertEquals(1, pushTokenRepository.deactivateByUserEmailAndDeviceId(
                user.getEmail(), "device-1"));
        assertFalse(pushTokenRepository.findById(matching.getId()).orElseThrow().isActive());
        assertTrue(pushTokenRepository.findById(otherDevice.getId()).orElseThrow().isActive());
    }

    private PushToken pushToken(User user, String deviceId, String tokenValue) {
        PushToken token = new PushToken();
        token.setUser(user);
        token.setDeviceId(deviceId);
        token.setDeviceType("android");
        token.setToken(tokenValue);
        token.setActive(true);
        return token;
    }
}
