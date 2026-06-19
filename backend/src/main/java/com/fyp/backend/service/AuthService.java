package com.fyp.backend.service;

import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.fyp.backend.dto.LoginDto;
import com.fyp.backend.dto.UserDto;
import com.fyp.backend.dto.UserProfileDto;
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

    @Autowired
    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtUtil jwtUtil,
            EmailService emailService, RedisService redisService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.emailService = emailService;
        this.redisService = redisService;
    }

    /**
     * Register a new user.
     *
     * @param userDto The user details to register.
     */
    public UserProfileDto registerUser(UserDto userDto) {
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

        User user = new User();
        user.setFirstName(userDto.getFirstName());
        user.setLastName(userDto.getLastName());
        user.setEmail(userDto.getEmail());
        user.setPassword(passwordEncoder.encode(userDto.getPassword()));
        user.setProfileImage(userDto.getProfileImage());
        user.setVerifiedUser(false);
        user.setAdmin(false);
        user.setBirthday(userDto.getBirthday());

        User savedUser = userRepository.save(user);

        return UserProfileDto.from(savedUser);
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
        // Only send codes for existing, active accounts — prevents using this as
        // an email-spam vector and avoids burning cooldown/daily quota on unknown
        // addresses. (Slight enumeration tradeoff, acceptable for a sign-up
        // verification endpoint; password reset stays silent for unknown emails.)
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> ApiException.badRequest("No account found for this email."));
        if (!user.isActive()) {
            throw ApiException.forbidden("This account has been deactivated. Please contact an administrator.");
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
     * Validate a registration email verification code. This only confirms the
     * user controls the email address — a security add-on at sign-up. It does
     * NOT change the account's "verified user" status, which is a separate,
     * admin-managed flag. Returns the user so the caller can issue session
     * tokens (auto-login after sign-up).
     */
    public User verifyCode(String email, String code) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> ApiException.badRequest("No account found for this email."));

        // A deactivated account must not be able to obtain tokens via verification.
        if (!user.isActive()) {
            throw ApiException.forbidden("This account has been deactivated. Please contact an administrator.");
        }

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

        // Success: invalidate the code (single-use) and clear the failure counter.
        redisService.clearOtpState(email);
        return user;
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
