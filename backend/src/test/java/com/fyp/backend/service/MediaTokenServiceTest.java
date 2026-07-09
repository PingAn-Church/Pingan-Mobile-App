package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

/**
 * Pure unit tests for the /media gateway's signed-URL tokens — no Spring context,
 * no network, explicit secrets so the host environment can't influence outcomes.
 */
class MediaTokenServiceTest {

    private static final Pattern QUERY = Pattern.compile("^e=(\\d+)&s=([A-Za-z0-9_-]+)$");

    private final MediaTokenService service = MediaTokenService.withSecret("unit-test-secret");

    private record Token(String expiresAt, String signature) {}

    private Token mint(String objectKey, long ttlSeconds) {
        String query = service.mintQuery(objectKey, ttlSeconds);
        Matcher matcher = QUERY.matcher(query);
        assertTrue(matcher.matches(), "unexpected token query shape: " + query);
        return new Token(matcher.group(1), matcher.group(2));
    }

    @Test
    void mintedTokenVerifies() {
        Token token = mint("eventPictures/pic.jpg", MediaTokenService.TTL_SECONDS);
        assertTrue(service.verify("eventPictures/pic.jpg", token.expiresAt(), token.signature()));
    }

    @Test
    void expiredTokenIsRejectedEvenWithValidSignature() {
        Token token = mint("eventPictures/pic.jpg", -10);
        assertFalse(service.verify("eventPictures/pic.jpg", token.expiresAt(), token.signature()));
    }

    @Test
    void tamperedSignatureIsRejected() {
        Token token = mint("eventPictures/pic.jpg", MediaTokenService.TTL_SECONDS);
        String tampered = (token.signature().charAt(0) == 'A' ? "B" : "A") + token.signature().substring(1);
        assertFalse(service.verify("eventPictures/pic.jpg", token.expiresAt(), tampered));
    }

    @Test
    void tokenForOneKeyDoesNotAuthorizeAnother() {
        Token token = mint("eventPictures/pic.jpg", MediaTokenService.TTL_SECONDS);
        assertFalse(service.verify("userProfilePictures/pic.jpg", token.expiresAt(), token.signature()));
    }

    @Test
    void alteredExpiryInvalidatesSignature() {
        Token token = mint("eventPictures/pic.jpg", MediaTokenService.TTL_SECONDS);
        String extended = String.valueOf(Long.parseLong(token.expiresAt()) + 3600);
        assertFalse(service.verify("eventPictures/pic.jpg", extended, token.signature()));
    }

    @Test
    void differentSecretsDoNotCrossVerify() {
        Token token = mint("eventPictures/pic.jpg", MediaTokenService.TTL_SECONDS);
        MediaTokenService other = MediaTokenService.withSecret("another-secret");
        assertFalse(other.verify("eventPictures/pic.jpg", token.expiresAt(), token.signature()));
    }

    @Test
    void malformedOrMissingParamsAreRejected() {
        Token token = mint("eventPictures/pic.jpg", MediaTokenService.TTL_SECONDS);
        assertFalse(service.verify("eventPictures/pic.jpg", "not-a-number", token.signature()));
        assertFalse(service.verify("eventPictures/pic.jpg", null, token.signature()));
        assertFalse(service.verify("eventPictures/pic.jpg", token.expiresAt(), null));
        assertFalse(service.verify("eventPictures/pic.jpg", "", token.signature()));
        assertFalse(service.verify("eventPictures/pic.jpg", token.expiresAt(), ""));
        assertFalse(service.verify(null, token.expiresAt(), token.signature()));
        assertFalse(service.verify("", token.expiresAt(), token.signature()));
    }
}
