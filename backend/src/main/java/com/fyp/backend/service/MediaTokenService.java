package com.fyp.backend.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import io.github.cdimascio.dotenv.Dotenv;

/**
 * Mints and verifies the HMAC-signed temporary URLs served by the /media gateway,
 * replacing OSS presigned GET URLs. Media loaders (RN Image, expo-av, web img tags)
 * can't send Authorization headers, so — exactly like presigning — the authorization
 * lives in the URL itself:
 *
 *   /media/{objectKey}?e=[expiry epoch seconds]&s=[base64url HMAC-SHA256(objectKey \n e)]
 *
 * Stateless: any instance holding the same secret can verify. base64url keeps '+' out
 * of the query string (clients escape '+' in signed queries defensively).
 */
@Service
public class MediaTokenService {

    private static final Logger log = LoggerFactory.getLogger(MediaTokenService.class);

    /** Matches the 60-minute expiry the OSS presigned download URLs used. */
    public static final long TTL_SECONDS = 60 * 60;

    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final byte[] secret;

    /**
     * Secret resolution mirrors where this app keeps its other secrets:
     * MEDIA_TOKEN_SECRET from .env / process env (dedicated, so it can rotate without
     * invalidating logins), else the Spring-resolved JWT_SECRET (env.properties), else
     * JwtUtil's dev default so local dev and CI boot without any configuration.
     */
    @Autowired
    public MediaTokenService(@Value("${JWT_SECRET:}") String jwtSecretProperty) {
        Dotenv dotenv = Dotenv.configure().ignoreIfMissing().load();
        String configured = dotenv.get("MEDIA_TOKEN_SECRET", System.getenv("MEDIA_TOKEN_SECRET"));
        if (configured == null || configured.isBlank()) {
            configured = jwtSecretProperty;
        }
        if (configured == null || configured.isBlank()) {
            configured = com.fyp.backend.util.JwtUtil.DEV_DEFAULT_SECRET;
            log.error("Neither MEDIA_TOKEN_SECRET nor JWT_SECRET is set - media URLs are "
                    + "signed with the built-in dev secret. NEVER run production this way.");
        }
        this.secret = configured.getBytes(StandardCharsets.UTF_8);
    }

    private MediaTokenService(byte[] secret) {
        this.secret = secret;
    }

    /** Explicit-secret factory for tests, immune to whatever the host environment sets. */
    static MediaTokenService withSecret(String secret) {
        return new MediaTokenService(secret.getBytes(StandardCharsets.UTF_8));
    }

    /** Query string ("e=...&s=...") authorizing GET /media/{objectKey} for TTL_SECONDS. */
    public String mintQuery(String objectKey) {
        return mintQuery(objectKey, TTL_SECONDS);
    }

    /** Same, with an explicit TTL — negative values mint already-expired tokens (tests). */
    public String mintQuery(String objectKey, long ttlSeconds) {
        long expiresAt = Instant.now().getEpochSecond() + ttlSeconds;
        return "e=" + expiresAt + "&s=" + sign(objectKey, expiresAt);
    }

    /** True when the signature matches this objectKey + expiry and hasn't expired. */
    public boolean verify(String objectKey, String expiresAtRaw, String signature) {
        if (objectKey == null || objectKey.isEmpty()
                || expiresAtRaw == null || expiresAtRaw.isEmpty()
                || signature == null || signature.isEmpty()) {
            return false;
        }
        long expiresAt;
        try {
            expiresAt = Long.parseLong(expiresAtRaw);
        } catch (NumberFormatException e) {
            return false;
        }
        if (Instant.now().getEpochSecond() > expiresAt) {
            return false;
        }
        byte[] expected = sign(objectKey, expiresAt).getBytes(StandardCharsets.UTF_8);
        byte[] provided = signature.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, provided); // constant-time
    }

    private String sign(String objectKey, long expiresAt) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret, HMAC_ALGORITHM));
            byte[] digest = mac.doFinal((objectKey + "\n" + expiresAt).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("Unable to sign media token", e);
        }
    }
}
