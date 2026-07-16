package com.fyp.backend.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

public final class ContentFingerprint {
    private static final String VERSION = "v1:";
    private static final String LEGACY_VERSION = "legacy:";

    private ContentFingerprint() {
    }

    public static String current(String contentType, String canonicalContent) {
        return VERSION + sha256(contentType + "\n" + safe(canonicalContent));
    }

    public static String legacy(String contentType, String messageType, String snapshot) {
        return LEGACY_VERSION + sha256(
                safe(contentType) + "\n" + safe(messageType) + "\n" + safe(snapshot));
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
