package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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
 * never log in / refresh, registration distinguishes active vs deactivated
 * collisions and only persists a pending sign-up (no user row until the code is
 * confirmed), and OTP verification is brute-force locked, single-use, and is where
 * the account is finally created. Pure unit tests — repositories, Redis, mail and
 * JWT are mocked (no DB/SMTP/Redis calls).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuthServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private JwtUtil jwtUtil;
    @Mock private EmailService emailService;
    @Mock private RedisService redisService;
    @Mock private OssCleanupService ossCleanupService;
    @Mock private PushNotificationService pushNotificationService;

    @InjectMocks private AuthService authService;

    private static final String EMAIL = "user@example.com";
    // A pending sign-up blob as AuthService serializes/deserializes it (public fields).
    private static final String PENDING_JSON =
            "{\"firstName\":\"New\",\"lastName\":\"User\",\"email\":\"" + EMAIL
            + "\",\"passwordHash\":\"hashed\",\"profileImage\":null,\"birthday\":null}";

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

    private UserDto registerDto() {
        UserDto dto = new UserDto();
        dto.setEmail(EMAIL);
        dto.setFirstName("New");
        dto.setLastName("User");
        dto.setPassword("secret123");
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

    // ---- registration collisions + pending-only persistence -----------------

    @Test
    void registerRejectsExistingActiveEmailAsConflict() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(true)));
        assertThrows(IllegalArgumentException.class, () -> authService.registerUser(registerDto()));
    }

    @Test
    void registerSignalsDeactivatedEmailDistinctly() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(false)));
        assertThrows(IllegalStateException.class, () -> authService.registerUser(registerDto()));
    }

    @Test
    void registerStashesPendingSignUpWithoutCreatingUser() {
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");

        authService.registerUser(registerDto());

        // The account row is NOT created here — only a pending record in Redis.
        verify(redisService).savePendingRegistration(eq(EMAIL), anyString());
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void replacingPendingSignupCleansPreviousAnonymousProfileImage() {
        UserDto dto = registerDto();
        dto.setProfileImage("https://oss.example.com/userProfilePictures/anon_new.jpg");
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");
        when(redisService.getPendingRegistration(EMAIL)).thenReturn(
                "{\"firstName\":\"Old\",\"lastName\":\"User\",\"email\":\"" + EMAIL
                        + "\",\"passwordHash\":\"hash\",\"profileImage\":"
                        + "\"https://oss.example.com/userProfilePictures/anon_old.jpg\","
                        + "\"birthday\":null}");

        authService.registerUser(dto);

        verify(redisService).clearPendingRegistrationMedia("anon_old.jpg");
        verify(ossCleanupService).deleteAfterCommit(
                "https://oss.example.com/userProfilePictures/anon_old.jpg");
    }

    @Test
    void registrationRejectsProfileMediaNotIssuedForAnonymousSignup() {
        UserDto dto = registerDto();
        dto.setProfileImage("https://oss.example.com/userProfilePictures/u99_avatar.jpg");

        assertThrows(IllegalArgumentException.class, () -> authService.registerUser(dto));
        verify(redisService, never()).savePendingRegistration(anyString(), anyString());
    }

    // ---- OTP verification: lockout, single-use, account materialisation ------

    @Test
    void verifyCodeIsLockedAfterTooManyFailures() {
        when(redisService.isOtpVerifyLocked(EMAIL)).thenReturn(true);

        ApiException ex = assertApiException(() -> authService.verifyCode(EMAIL, "000000"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex.getStatus());
        verify(redisService, never()).clearOtpState(EMAIL);
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void verifyCodeRejectsWrongCodeAndRecordsFailure() {
        when(redisService.isOtpVerifyLocked(EMAIL)).thenReturn(false);
        when(redisService.peekOtpSecret(EMAIL)).thenReturn(TotpUtil.generateSecret());

        ApiException ex = assertApiException(() -> authService.verifyCode(EMAIL, "000000"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
        verify(redisService).recordOtpVerifyFailure(EMAIL);
        verify(redisService, never()).clearOtpState(EMAIL);
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void verifyCodeCreatesAccountFromPendingAndClearsStateSingleUse() {
        String secret = TotpUtil.generateSecret();
        when(redisService.isOtpVerifyLocked(EMAIL)).thenReturn(false);
        when(redisService.peekOtpSecret(EMAIL)).thenReturn(secret);
        when(redisService.getPendingRegistration(EMAIL)).thenReturn(PENDING_JSON);
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        User result = authService.verifyCode(EMAIL, TotpUtil.currentCode(secret));

        assertEquals(EMAIL, result.getEmail());
        org.junit.jupiter.api.Assertions.assertFalse(result.isVerifiedUser()); // admin approval is separate
        verify(userRepository).save(any(User.class));            // account materialised on verify
        verify(redisService).deletePendingRegistration(EMAIL);    // pending consumed
        verify(redisService).clearOtpState(EMAIL);                // code single-use
    }

    @Test
    void verifyCodeFailsWhenPendingSignUpExpired() {
        String secret = TotpUtil.generateSecret();
        when(redisService.isOtpVerifyLocked(EMAIL)).thenReturn(false);
        when(redisService.peekOtpSecret(EMAIL)).thenReturn(secret);
        when(redisService.getPendingRegistration(EMAIL)).thenReturn(null); // lapsed TTL

        ApiException ex = assertApiException(() -> authService.verifyCode(EMAIL, TotpUtil.currentCode(secret)));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
        verify(userRepository, never()).save(any(User.class));
        verify(redisService).clearOtpState(EMAIL);
    }

    // ---- send verification code: pending gate + rate limits -----------------

    @Test
    void sendVerificationCodeRejectsWhenNoPendingRegistration() {
        when(redisService.hasPendingRegistration(EMAIL)).thenReturn(false);
        ApiException ex = assertApiException(() -> authService.sendVerificationCode(EMAIL));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
        verify(emailService, never()).sendVerificationCodeEmail(anyString(), anyString());
    }

    @Test
    void sendVerificationCodeEnforcesCooldown() {
        when(redisService.hasPendingRegistration(EMAIL)).thenReturn(true);
        when(redisService.tryStartOtpCooldown(EMAIL)).thenReturn(false);
        when(redisService.otpCooldownRemaining(EMAIL)).thenReturn(42L);

        ApiException ex = assertApiException(() -> authService.sendVerificationCode(EMAIL));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex.getStatus());
        verify(emailService, never()).sendVerificationCodeEmail(anyString(), anyString());
    }

    // ---- code-confirmed password reset ---------------------------------------

    private static final String RESET = RedisService.OTP_SCOPE_RESET;

    @Test
    void requestPasswordResetSendsCurrentTotpCode() {
        String secret = TotpUtil.generateSecret();
        when(redisService.tryStartOtpCooldown(RESET, EMAIL)).thenReturn(true);
        when(redisService.withinOtpDailyLimit(RESET, EMAIL)).thenReturn(true);
        when(redisService.getOrCreateOtpSecret(RESET, EMAIL)).thenReturn(secret);
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(true)));

        authService.requestPasswordReset(EMAIL);

        verify(emailService).sendPasswordResetCodeEmail(EMAIL, TotpUtil.currentCode(secret));
        verify(userRepository, never()).save(any(User.class)); // nothing changes at request time
    }

    @Test
    void requestPasswordResetIsSilentForUnknownEmail() {
        when(redisService.tryStartOtpCooldown(RESET, EMAIL)).thenReturn(true);
        when(redisService.withinOtpDailyLimit(RESET, EMAIL)).thenReturn(true);
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.empty());

        authService.requestPasswordReset(EMAIL); // no exception — no enumeration

        verify(emailService, never()).sendPasswordResetCodeEmail(anyString(), anyString());
    }

    @Test
    void requestPasswordResetRateLimitsBeforeTheUserLookup() {
        // The cooldown fires for unknown emails too, so a 429 reveals nothing.
        when(redisService.tryStartOtpCooldown(RESET, EMAIL)).thenReturn(false);
        when(redisService.otpCooldownRemaining(RESET, EMAIL)).thenReturn(42L);

        ApiException ex = assertApiException(() -> authService.requestPasswordReset(EMAIL));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex.getStatus());
        verify(userRepository, never()).findByEmail(anyString());
        verify(emailService, never()).sendPasswordResetCodeEmail(anyString(), anyString());
    }

    @Test
    void requestPasswordResetEnforcesDailyCap() {
        when(redisService.tryStartOtpCooldown(RESET, EMAIL)).thenReturn(true);
        when(redisService.withinOtpDailyLimit(RESET, EMAIL)).thenReturn(false);

        ApiException ex = assertApiException(() -> authService.requestPasswordReset(EMAIL));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex.getStatus());
        verify(emailService, never()).sendPasswordResetCodeEmail(anyString(), anyString());
    }

    @Test
    void confirmPasswordResetChangesPasswordAndConsumesCode() {
        String secret = TotpUtil.generateSecret();
        User u = user(true);
        when(redisService.isOtpVerifyLocked(RESET, EMAIL)).thenReturn(false);
        when(redisService.peekOtpSecret(RESET, EMAIL)).thenReturn(secret);
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(u));
        when(passwordEncoder.encode("newSecret123")).thenReturn("encoded-new");

        authService.confirmPasswordReset(EMAIL, TotpUtil.currentCode(secret), "newSecret123");

        assertEquals("encoded-new", u.getPassword());
        verify(userRepository).save(u);
        verify(redisService).clearOtpState(RESET, EMAIL); // single-use
    }

    @Test
    void confirmPasswordResetRejectsWrongCodeAndRecordsFailure() {
        when(redisService.isOtpVerifyLocked(RESET, EMAIL)).thenReturn(false);
        when(redisService.peekOtpSecret(RESET, EMAIL)).thenReturn(TotpUtil.generateSecret());

        ApiException ex = assertApiException(
                () -> authService.confirmPasswordReset(EMAIL, "000000", "newSecret123"));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
        verify(redisService).recordOtpVerifyFailure(RESET, EMAIL);
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void confirmPasswordResetIsLockedAfterTooManyFailures() {
        when(redisService.isOtpVerifyLocked(RESET, EMAIL)).thenReturn(true);

        ApiException ex = assertApiException(
                () -> authService.confirmPasswordReset(EMAIL, "000000", "newSecret123"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex.getStatus());
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void confirmPasswordResetRejectsBlankPassword() {
        ApiException ex = assertApiException(
                () -> authService.confirmPasswordReset(EMAIL, "123456", "  "));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void resetFlowNeverTouchesRegistrationOtpState() {
        String secret = TotpUtil.generateSecret();
        when(redisService.tryStartOtpCooldown(RESET, EMAIL)).thenReturn(true);
        when(redisService.withinOtpDailyLimit(RESET, EMAIL)).thenReturn(true);
        when(redisService.getOrCreateOtpSecret(RESET, EMAIL)).thenReturn(secret);
        when(userRepository.findByEmail(EMAIL)).thenReturn(Optional.of(user(true)));

        authService.requestPasswordReset(EMAIL);

        // The one-arg overloads are the registration scope; the reset flow must not
        // collide with a registration code pending for the same address.
        verify(redisService, never()).tryStartOtpCooldown(EMAIL);
        verify(redisService, never()).getOrCreateOtpSecret(EMAIL);
        verify(redisService, never()).clearOtpState(EMAIL);
    }
}
