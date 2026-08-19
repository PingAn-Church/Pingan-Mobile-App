package com.fyp.backend.util;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Base64;
import java.util.Date;

@Component
public class JwtUtil {

    private static final Logger log = LoggerFactory.getLogger(JwtUtil.class);

    // Development-only fallback signing key. Anyone with repo access knows it, so a
    // deployment still running on it can have tokens forged for any account — hence
    // the ERROR below whenever it is in use. Rotating the secret invalidates all
    // outstanding tokens. MediaTokenService shares this constant as its own last
    // fallback; keep the two in lockstep.
    public static final String DEV_DEFAULT_SECRET = "KxuYGk9vMEwse2p0NFhvNzlRc3ZTcE1PeXNBMjRTdFE=";

    // Signing key. Override via the JWT_SECRET env var (base64-encoded, 256-bit).
    private final byte[] SECRET_KEY;
    private final long ACCESS_EXPIRATION_TIME = 1000 * 60 * 15; // 15 minutes
    private final long REFRESH_EXPIRATION_TIME = 1000L * 60 * 60 * 24 * 30; // 30 days

    public JwtUtil(@Value("${JWT_SECRET:" + DEV_DEFAULT_SECRET + "}") String secret) {
        // A set-but-blank JWT_SECRET bypasses the @Value default and would decode to a
        // zero-length HS256 key. Refuse to start rather than sign with an empty key.
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                    "JWT_SECRET is set but blank - an empty env var decodes to a zero-length "
                    + "HS256 key. Set a base64-encoded 256-bit secret (openssl rand -base64 32), "
                    + "or unset the variable entirely to use the built-in dev default.");
        }
        if (DEV_DEFAULT_SECRET.equals(secret)) {
            log.error("JWT_SECRET is not set - using the built-in dev secret. "
                    + "Tokens are forgeable by anyone with repo access; NEVER run production this way.");
        }
        this.SECRET_KEY = Base64.getDecoder().decode(secret);
    }

    /**
     * Generate an Access Token (Short-lived)
     */
    public String generateAccessToken(String email) {
        return Jwts.builder()
                .setSubject(email)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + ACCESS_EXPIRATION_TIME))
                .signWith(SignatureAlgorithm.HS256, SECRET_KEY)
                .compact();
    }

    /**
     * Generate a Refresh Token (Long-lived)
     */
    public String generateRefreshToken(String email) {
        return Jwts.builder()
                .setSubject(email)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + REFRESH_EXPIRATION_TIME))
                .signWith(SignatureAlgorithm.HS256, SECRET_KEY)
                .compact();
    }

    /**
     * Validate a JWT Token
     */
    public boolean validateToken(String token, String email) {
        return extractEmail(token).equals(email) && !isTokenExpired(token);
    }

    /**
     * Extract Email from Token
     */
    public String extractEmail(String token) {
        try {
            return Jwts.parser()
                    .setSigningKey(SECRET_KEY)
                    .parseClaimsJws(token)
                    .getBody()
                    .getSubject();
        } catch (Exception e) {
            log.warn("Could not extract email from token: {}", e.getMessage());
            return null; // Return null if token parsing fails
        }
    }


    public boolean isTokenExpired(String token) {
        try {
            return Jwts.parser()
                    .setSigningKey(SECRET_KEY)
                    .parseClaimsJws(token)
                    .getBody()
                    .getExpiration()
                    .before(new Date());
        } catch (Exception e) {
            log.warn("Could not check token expiration: {}", e.getMessage());
            return true; // If there's an issue, assume expired
        }
    }

    public String extractEmailFromHeader(String authorizationHeader) {
        if (authorizationHeader != null && authorizationHeader.startsWith("Bearer ")) {
            String rawToken = authorizationHeader.substring(7);
            return extractEmail(rawToken);
        }
        return null;
    }

}


