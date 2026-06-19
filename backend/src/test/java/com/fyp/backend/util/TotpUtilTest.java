package com.fyp.backend.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class TotpUtilTest {

    @Test
    void sameSecretAndWindowYieldsSameCode() {
        String secret = TotpUtil.generateSecret();
        // Requesting again within the same window must return the same code so a
        // resent verification email stays valid.
        assertEquals(TotpUtil.currentCode(secret), TotpUtil.currentCode(secret));
    }

    @Test
    void currentCodeIsSixDigits() {
        String code = TotpUtil.currentCode(TotpUtil.generateSecret());
        assertTrue(code.matches("\\d{6}"), "expected 6 digits, got " + code);
    }

    @Test
    void verifyAcceptsCurrentCode() {
        String secret = TotpUtil.generateSecret();
        assertTrue(TotpUtil.verify(secret, TotpUtil.currentCode(secret)));
    }

    @Test
    void verifyRejectsMalformedOrWrongCode() {
        String secret = TotpUtil.generateSecret();
        // "12" can never equal a 6-digit code in any window, so this is deterministic.
        assertFalse(TotpUtil.verify(secret, "12"));
        assertFalse(TotpUtil.verify(secret, null));
    }
}
