package com.fyp.backend.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Base64;

import org.junit.jupiter.api.Test;

class JwtUtilTest {

    private static final String CUSTOM_SECRET =
            Base64.getEncoder().encodeToString("a-strong-256-bit-test-secret-value!!".getBytes());

    @Test
    void blankSecretFailsStartup() {
        // A set-but-blank JWT_SECRET must fail fast: it would otherwise decode to a
        // zero-length HS256 key.
        assertThrows(IllegalStateException.class, () -> new JwtUtil(""));
        assertThrows(IllegalStateException.class, () -> new JwtUtil("   "));
    }

    @Test
    void customSecretRoundTripsTokens() {
        JwtUtil jwtUtil = new JwtUtil(CUSTOM_SECRET);
        String token = jwtUtil.generateAccessToken("user@example.com");
        assertEquals("user@example.com", jwtUtil.extractEmail(token));
        assertFalse(jwtUtil.isTokenExpired(token));
        assertTrue(jwtUtil.validateToken(token, "user@example.com"));
    }

    @Test
    void devDefaultStillBoots() {
        // Dev and CI run without JWT_SECRET; the default must construct (with a logged
        // error), not throw.
        JwtUtil jwtUtil = new JwtUtil(JwtUtil.DEV_DEFAULT_SECRET);
        assertNotNull(jwtUtil.generateAccessToken("user@example.com"));
    }

    @Test
    void tokenFromDifferentSecretIsRejected() {
        JwtUtil signer = new JwtUtil(CUSTOM_SECRET);
        JwtUtil verifier = new JwtUtil(JwtUtil.DEV_DEFAULT_SECRET);
        String token = signer.generateAccessToken("user@example.com");
        assertEquals(null, verifier.extractEmail(token));
    }
}
