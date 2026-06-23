package com.fyp.backend.util;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Base64;
import java.util.Date;

@Component
public class JwtUtil {

    // Signing key. Override via the JWT_SECRET env var (base64-encoded, 256-bit). The
    // default keeps existing tokens and local dev working when it's unset; set a strong
    // secret in production. Rotating the secret invalidates all outstanding tokens.
    private final byte[] SECRET_KEY;
    private final long ACCESS_EXPIRATION_TIME = 1000 * 60 * 15; // 15 minutes
    private final long REFRESH_EXPIRATION_TIME = 1000L * 60 * 60 * 24 * 30; // 30 days

    public JwtUtil(@Value("${JWT_SECRET:KxuYGk9vMEwse2p0NFhvNzlRc3ZTcE1PeXNBMjRTdFE=}") String secret) {
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
//    public String extractEmail(String token) {
//        return Jwts.parser()
//                .setSigningKey(SECRET_KEY)
//                .parseClaimsJws(token)
//                .getBody()
//                .getSubject();
//    }
    public String extractEmail(String token) {
        try {
            return Jwts.parser()
                    .setSigningKey(SECRET_KEY)
                    .parseClaimsJws(token)
                    .getBody()
                    .getSubject();
        } catch (Exception e) {
            System.err.println("🔴 Error extracting email from token: " + e.getMessage());
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
            System.err.println("🔴 Error checking token expiration: " + e.getMessage());
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


