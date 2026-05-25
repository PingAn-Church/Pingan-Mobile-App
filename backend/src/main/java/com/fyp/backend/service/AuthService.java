package com.fyp.backend.service;

import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.fyp.backend.dto.LoginDto;
import com.fyp.backend.dto.UserDto;
import com.fyp.backend.dto.UserProfileDto;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final EmailService emailService;

    @Autowired
    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtUtil jwtUtil, EmailService emailService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.emailService = emailService;
    }

    /**
     * Register a new user.
     *
     * @param userDto The user details to register.
     */
    public UserProfileDto registerUser(UserDto userDto) {
        if (userRepository.findByEmail(userDto.getEmail()).isPresent()) {
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

        return new UserProfileDto(
                savedUser.getId(),
                savedUser.getFirstName(),
                savedUser.getLastName(),
                savedUser.getEmail(),
                savedUser.getProfileImage(),
                savedUser.isVerifiedUser(),
                savedUser.isAdmin(),
                savedUser.getBirthday()
        );
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

        return user;
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
