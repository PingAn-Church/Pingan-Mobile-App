package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.fyp.backend.dto.LoginDto;
import com.fyp.backend.dto.UserDto;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;
import com.fyp.backend.util.TotpUtil;

/**
 * Security-behaviour regression tests for the auth flow: deactivated accounts must
 * never log in / refresh / verify, registration distinguishes active vs deactivated
 * collisions, and OTP verification is brute-force locked and single-use. Pure unit
 * tests — repositories, Redis, mail and JWT are mocked (no DB/SMTP/Redis calls).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuthServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private JwtUtil jwtUtil;
    @Mock private EmailService emailService;
    @Mock private RedisService redisService;

    @InjectMocks private AuthService authService;

    private static final String EMAIL = "user@example.com";

    private User user(boolean active) {
        User u = new User();
        u.setId(7L);
        u.setEmail(EMAIL);
        u.setPassword("hashed");
        u.setActive(active);
        return u;
    }

    private LoginDto login() {
        LoginDto dto = new LoginDto();
        dto.setEmail(EMAIL);
        dto.setPassword("secret");
        return dto;
    }

    private ApiException assertApiException(Runnable r) {
        return assertThrows(ApiException.class, r::run);
    }

    // ---- login / activation gating -----------------------------------------

    @Test
    void authenticateUserBlocksDeactivatedAccount() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(false)));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(true);

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> authService.authenticateUser(login()));
        org.junit.jupiter.api.Assertions.assertTrue(ex.getMessage().toLowerCase().contains("deactivated"));
    }

    @Test
    void authenticateUserSucceedsForActiveAccount() {
        User u = user(true);
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(u));
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(true);

        assertSame(u, authService.authenticateUser(login()));
    }

    @Test
    void isAccountActiveReflectsTheFlag() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(false)));
        org.junit.jupiter.api.Assertions.assertFalse(authService.isAccountActive(EMAIL));
    }

    // ---- registration collisions -------------------------------------------

    @Test
    void registerRejectsExistingActiveEmailAsConflict() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(true)));
        UserDto dto = new UserDto();
        dto.setEmail(EMAIL);
        assertThrows(IllegalArgumentException.class, () -> authService.registerUser(dto));
    }

    @Test
    void registerSignalsDeactivatedEmailDistinctly() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(false)));
        UserDto dto = new UserDto();
        dto.setEmail(EMAIL);
        assertThrows(IllegalStateException.class, () -> authService.registerUser(dto));
    }

    // ---- OTP verification: lockout, single-use, gating ----------------------

    @Test
    void verifyCodeIsLockedAfterTooManyFailures() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(true)));
        when(redisService.isOtpVerifyLocked(EMAIL)).thenReturn(true);

        ApiException ex = assertApiException(() -> authService.verifyCode(EMAIL, "000000"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex.getStatus());
        verify(redisService, never()).clearOtpState(EMAIL);
    }

    @Test
    void verifyCodeRejectsWrongCodeAndRecordsFailure() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(true)));
        when(redisService.isOtpVerifyLocked(EMAIL)).thenReturn(false);
        when(redisService.peekOtpSecret(EMAIL)).thenReturn(TotpUtil.generateSecret());

        ApiException ex = assertApiException(() -> authService.verifyCode(EMAIL, "000000"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
        verify(redisService).recordOtpVerifyFailure(EMAIL);
        verify(redisService, never()).clearOtpState(EMAIL);
    }

    @Test
    void verifyCodeAcceptsValidCodeAndClearsStateSingleUse() {
        String secret = TotpUtil.generateSecret();
        User u = user(true);
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(u));
        when(redisService.isOtpVerifyLocked(EMAIL)).thenReturn(false);
        when(redisService.peekOtpSecret(EMAIL)).thenReturn(secret);

        User result = authService.verifyCode(EMAIL, TotpUtil.currentCode(secret));

        assertSame(u, result);
        verify(redisService).clearOtpState(EMAIL); // single-use: code invalidated on success
    }

    @Test
    void verifyCodeBlocksDeactivatedAccount() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(false)));
        ApiException ex = assertApiException(() -> authService.verifyCode(EMAIL, "000000"));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
    }

    // ---- send verification code: existence / activation / rate limits -------

    @Test
    void sendVerificationCodeRejectsUnknownEmail() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
        ApiException ex = assertApiException(() -> authService.sendVerificationCode(EMAIL));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
        verify(emailService, never()).sendVerificationCodeEmail(anyString(), anyString());
    }

    @Test
    void sendVerificationCodeBlocksDeactivatedAccount() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(false)));
        ApiException ex = assertApiException(() -> authService.sendVerificationCode(EMAIL));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
    }

    @Test
    void sendVerificationCodeEnforcesCooldown() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(true)));
        when(redisService.tryStartOtpCooldown(EMAIL)).thenReturn(false);
        when(redisService.otpCooldownRemaining(EMAIL)).thenReturn(42L);

        ApiException ex = assertApiException(() -> authService.sendVerificationCode(EMAIL));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex.getStatus());
        verify(emailService, never()).sendVerificationCodeEmail(anyString(), anyString());
    }
}
