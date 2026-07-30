package com.fyp.backend.service;

import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.dto.LoginDto;
import com.fyp.backend.dto.UserDto;
import com.fyp.backend.exception.ApiException;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;
import com.fyp.backend.util.TotpUtil;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final EmailService emailService;
    private final RedisService redisService;
    private final OssCleanupService ossCleanupService;
    // Serializes the pending sign-up blob stored in Redis until the code is confirmed.
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtUtil jwtUtil,
            EmailService emailService, RedisService redisService, OssCleanupService ossCleanupService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.emailService = emailService;
        this.redisService = redisService;
        this.ossCleanupService = ossCleanupService;
    }

    /**
     * The details captured at sign-up, held in Redis until the emailed code is
     * confirmed. Public fields keep Jackson (de)serialization trivial. The password
     * is already bcrypt-hashed before it is stored here — the plaintext is never kept.
     */
    public static class PendingRegistration {
        public String firstName;
        public String lastName;
        public String email;
        public String passwordHash;
        public String profileImage;
        public String birthday;
    }

    /**
     * Begin registration: validate the email is free, then stash the sign-up in
     * Redis (NOT the database) so a mistyped address that never receives the code
     * cannot leave an orphan, unverifiable user row behind (the source of duplicate
     * same-name accounts). The account row is created only later, in
     * {@link #verifyCode}, once the emailed code is confirmed.
     *
     * @param userDto The user details to register.
     */
    public void registerUser(UserDto userDto) {
        Optional<User> existing = userRepository.findByEmail(userDto.getEmail());
        if (existing.isPresent()) {
            // A deactivated account still owns the email; surface a distinct
            // signal (handled as 403) so the app can guide them to an admin
            // rather than showing a generic "already exists".
            if (!existing.get().isActive()) {
                throw new IllegalStateException(
                        "This account has been deactivated. Please contact an administrator.");
            }
            throw new IllegalArgumentException("An account with this email already exists.");
        }
        if (userDto.getProfileImage() != null && !userDto.getProfileImage().isBlank()
                && !isAnonymousRegistrationMedia(userDto.getProfileImage())) {
            throw new IllegalArgumentException("Invalid registration profile image.");
        }

        String previousProfileImage = pendingProfileImage(userDto.getEmail());
        PendingRegistration pending = new PendingRegistration();
        pending.firstName = userDto.getFirstName();
        pending.lastName = userDto.getLastName();
        pending.email = userDto.getEmail();
        pending.passwordHash = passwordEncoder.encode(userDto.getPassword());
        pending.profileImage = userDto.getProfileImage();
        pending.birthday = userDto.getBirthday();

        try {
            // Overwrites any earlier pending record for this email (e.g. a retry).
            redisService.savePendingRegistration(userDto.getEmail(), objectMapper.writeValueAsString(pending));
            redisService.markPendingRegistrationMedia(mediaFileName(pending.profileImage));
            if (previousProfileImage != null
                    && isAnonymousRegistrationMedia(previousProfileImage)
                    && !java.util.Objects.equals(previousProfileImage, pending.profileImage)) {
                redisService.clearPendingRegistrationMedia(mediaFileName(previousProfileImage));
                ossCleanupService.deleteAfterCommit(previousProfileImage);
            }
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Could not process registration. Please try again.", e);
        }
    }

    /**
     * Authenticate a user and generate a JWT.
     *
     * @param loginDto The login credentials.
     * @return The generated JWT token.
     */
//    public String authenticateUser(LoginDto loginDto) {
//        User user = userRepository.findByEmail(loginDto.getEmail())
//                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password."));
//
//        if (!passwordEncoder.matches(loginDto.getPassword(), user.getPassword())) {
//            throw new IllegalArgumentException("Invalid email or password.");
//        }
//
//        return jwtUtil.generateToken(user.getEmail());
//    }

    public User authenticateUser(LoginDto loginDto) {
        User user = userRepository.findByEmail(loginDto.getEmail())
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password."));

        if (!passwordEncoder.matches(loginDto.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Invalid email or password.");
        }

        if (!user.isActive()) {
            throw new IllegalArgumentException("This account has been deactivated. Please contact an administrator.");
        }

        return user;
    }

    /** Whether an account exists and is active (used to gate token refresh). */
    public boolean isAccountActive(String email) {
        return userRepository.findByEmail(email).map(User::isActive).orElse(false);
    }

    public void resetUserPassword(String email) {
        Optional<User> userOptional = userRepository.findByEmail(email);
        
        if (userOptional.isPresent()) {
            User user = userOptional.get();
            
            // Generate a random password
            String newPassword = UUID.randomUUID().toString().substring(0, 8);
            user.setPassword(passwordEncoder.encode(newPassword));
            userRepository.save(user);
            
            // Send email to user
            emailService.sendPasswordResetEmail(user.getEmail(), newPassword);
        }
    }

    /**
     * Email a time-based verification code, enforcing a 60s per-email cooldown
     * and a daily cap. Codes are stable within a time window (see TotpUtil), so
     * a resend inside the window returns the same code the user already received.
     */
    public void sendVerificationCode(String email) {
        // The account isn't persisted until the code is confirmed, so gate on a
        // pending sign-up existing (created by registerUser) rather than a user
        // row. This still prevents spamming codes at arbitrary addresses and only
        // burns cooldown/daily quota for someone actually mid-registration.
        if (!redisService.hasPendingRegistration(email)) {
            throw ApiException.badRequest("No pending registration found for this email. Please sign up again.");
        }
        if (!redisService.tryStartOtpCooldown(email)) {
            long wait = redisService.otpCooldownRemaining(email);
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Please wait " + wait + " seconds before requesting another code.");
        }
        if (!redisService.withinOtpDailyLimit(email)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Daily verification limit reached. Please try again tomorrow.");
        }
        String secret = redisService.getOrCreateOtpSecret(email);
        emailService.sendVerificationCodeEmail(email, TotpUtil.currentCode(secret));
    }

    /**
     * Confirm the emailed code and, on success, materialise the account from the
     * pending sign-up held in Redis — this is where the user row is finally created
     * (deliberately not at register time; see {@link #registerUser}). The new
     * account starts as a NON-"verified user" (that flag is a separate, admin-managed
     * approval). Returns the user so the caller can issue session tokens (auto-login).
     */
    public User verifyCode(String email, String code) {
        // Throttle brute-force guessing of the 6-digit code.
        if (redisService.isOtpVerifyLocked(email)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many incorrect attempts. Please try again later.");
        }

        String secret = redisService.peekOtpSecret(email);
        if (secret == null || !TotpUtil.verify(secret, code)) {
            redisService.recordOtpVerifyFailure(email);
            throw ApiException.badRequest("Invalid or expired verification code.");
        }

        // Code is valid — turn the pending sign-up into a real account. If it lapsed
        // (TTL) between sending and entering the code, ask them to sign up again.
        String pendingJson = redisService.getPendingRegistration(email);
        if (pendingJson == null) {
            redisService.clearOtpState(email);
            throw ApiException.badRequest("Your registration session expired. Please sign up again.");
        }

        // A row may already exist if two devices verified the same email at once;
        // treat the first materialisation as authoritative and just log the other in.
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            PendingRegistration pending;
            try {
                pending = objectMapper.readValue(pendingJson, PendingRegistration.class);
            } catch (JsonProcessingException e) {
                throw ApiException.badRequest("Your registration session is invalid. Please sign up again.");
            }
            user = new User();
            user.setFirstName(pending.firstName);
            user.setLastName(pending.lastName);
            user.setEmail(pending.email);
            // Already bcrypt-hashed at register time — store as-is, do not re-encode.
            user.setPassword(pending.passwordHash);
            user.setProfileImage(pending.profileImage);
            user.setBirthday(pending.birthday);
            user.setVerifiedUser(false);
            user.setAdmin(false);
            user = userRepository.save(user);
        }

        // Single-use: invalidate the code and drop the now-consumed pending record.
        redisService.deletePendingRegistration(email);
        redisService.clearPendingRegistrationMedia(mediaFileName(user.getProfileImage()));
        redisService.clearOtpState(email);
        return user;
    }

    private String mediaFileName(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        String clean = url.split("\\?", 2)[0];
        int slash = clean.lastIndexOf('/');
        return slash >= 0 ? clean.substring(slash + 1) : clean;
    }

    private boolean isAnonymousRegistrationMedia(String url) {
        String fileName = mediaFileName(url);
        return fileName != null && fileName.startsWith("anon_");
    }

    private String pendingProfileImage(String email) {
        String pendingJson = redisService.getPendingRegistration(email);
        if (pendingJson == null) {
            return null;
        }
        try {
            return objectMapper.readValue(pendingJson, PendingRegistration.class).profileImage;
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    public void changeUserPassword(String email, String currentPassword, String newPassword) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));
    
        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new IllegalArgumentException("Current password is incorrect.");
        }
    
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }
    
}
