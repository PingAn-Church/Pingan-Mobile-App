package com.fyp.backend.util;

import java.nio.ByteBuffer;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Minimal RFC 6238 (TOTP) implementation — no external dependency.
 *
 * <p>Used for registration email verification. Because the code is derived from
 * a per-email secret and the current time window, requesting the code again
 * within the same window returns the SAME code, so resent emails stay valid.
 * A 5-minute step with a +/-1 window tolerance gives the user time to enter it.
 */
public final class TotpUtil {

    private static final int DIGITS = 6;
    private static final long STEP_SECONDS = 300; // 5-minute window
    private static final int MOD = 1_000_000; // 6 digits
    private static final SecureRandom RANDOM = new SecureRandom();

    private TotpUtil() {
    }

    /** Generate a fresh random secret (Base64) to associate with an email. */
    public static String generateSecret() {
        byte[] buf = new byte[20];
        RANDOM.nextBytes(buf);
        return Base64.getEncoder().encodeToString(buf);
    }

    /** The current code for the given secret. */
    public static String currentCode(String secretBase64) {
        return codeForCounter(secretBase64, currentCounter());
    }

    /** True if {@code code} matches the current window or one step either side. */
    public static boolean verify(String secretBase64, String code) {
        if (secretBase64 == null || code == null) {
            return false;
        }
        String trimmed = code.trim();
        long counter = currentCounter();
        for (long c = counter - 1; c <= counter + 1; c++) {
            if (codeForCounter(secretBase64, c).equals(trimmed)) {
                return true;
            }
        }
        return false;
    }

    private static long currentCounter() {
        return System.currentTimeMillis() / 1000L / STEP_SECONDS;
    }

    private static String codeForCounter(String secretBase64, long counter) {
        try {
            byte[] key = Base64.getDecoder().decode(secretBase64);
            byte[] data = ByteBuffer.allocate(8).putLong(counter).array();
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] hash = mac.doFinal(data);
            int offset = hash[hash.length - 1] & 0x0F;
            int binary = ((hash[offset] & 0x7F) << 24)
                    | ((hash[offset + 1] & 0xFF) << 16)
                    | ((hash[offset + 2] & 0xFF) << 8)
                    | (hash[offset + 3] & 0xFF);
            return String.format("%0" + DIGITS + "d", binary % MOD);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to generate TOTP code", e);
        }
    }
}
