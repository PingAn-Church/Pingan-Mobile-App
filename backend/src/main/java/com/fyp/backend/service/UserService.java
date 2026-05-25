package com.fyp.backend.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.dto.UserDto;
import com.fyp.backend.dto.UserProfileDto;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private RedisService redisService;

    /**
     * Retrieves the user profile of the currently authenticated user.
     * 
     * @param token The JWT authorization token.
     * @return UserProfileDto if found, otherwise null.
     */
//    public Optional<UserProfileDto> getUserProfile(String token) {
//        String email = jwtUtil.extractEmail(token);
//        Optional<User> userOptional = userRepository.findByEmail(email);
//
//        return userOptional.map(user -> new UserProfileDto(
//                user.getId(),
//                user.getFirstName(),
//                user.getLastName(),
//                user.getEmail(),
//                user.getProfileImage(),
//                user.isVerifiedUser(),
//                user.isAdmin(),
//                user.getBirthday()));
//    }

    public Optional<UserProfileDto> getUserProfileFromHeader(String authorizationHeader) {
        String email = jwtUtil.extractEmailFromHeader(authorizationHeader);
        if (email == null) return Optional.empty();

        return userRepository.findByEmail(email)
                .map(user -> new UserProfileDto(
                        user.getId(),
                        user.getFirstName(),
                        user.getLastName(),
                        user.getEmail(),
                        user.getProfileImage(),
                        user.isVerifiedUser(),
                        user.isAdmin(),
                        user.getBirthday()
                ));
    }


    /**
     * Retrieves a user's profile by user ID.
     * 
     * @param userId The ID of the user.
     * @return UserProfileDto if found, otherwise null.
     */
    public Optional<UserProfileDto> getUserById(Long userId) {
        Optional<User> userOptional = userRepository.findById(userId);
        return userOptional.map(user -> new UserProfileDto(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                user.getEmail(),
                user.getProfileImage(),
                user.isVerifiedUser(),
                user.isAdmin(),
                user.getBirthday()));
    }

    /**
     * Retrieves all users except the currently authenticated one.
     * 
     * @param token The JWT authorization token.
     * @return List of UserProfileDto.
     */
    public List<UserProfileDto> getAllUsers(String token) {
        String email = jwtUtil.extractEmail(token);
        Optional<User> userOptional = userRepository.findByEmail(email);

        if (!userOptional.isPresent()) {
            return List.of(); // Return empty list if user not found
        }

        User currentUser = userOptional.get();
        return userRepository.findAll().stream()
                .filter(user -> !user.getId().equals(currentUser.getId()))
                .map(user -> new UserProfileDto(
                        user.getId(),
                        user.getFirstName(),
                        user.getLastName(),
                        user.getEmail(),
                        user.getProfileImage(),
                        user.isVerifiedUser(),
                        user.isAdmin(),
                        user.getBirthday()))
                .collect(Collectors.toList());
    }

    /**
     * Retrieves a map of all online users.
     * 
     * @return Map of online users.
     */
    public Map<String, String> getOnlineUsers() {
        return redisService.getAllOnlineUsers();
    }

    public List<User> findVerifiedUsers() {
        return userRepository.findByIsVerifiedUserTrue();
    }

    public List<User> findAdmins() {
        return userRepository.findByIsAdminTrue();
    }

    @Transactional
    public void updateUserVerifiedStatus(Long userId, boolean isVerifiedUser) {
        Optional<User> userOptional = userRepository.findById(userId);
        if (userOptional.isPresent()) {
            User user = userOptional.get();
            user.setVerifiedUser(isVerifiedUser);
            userRepository.save(user);
        } else {
            throw new RuntimeException("User not found");
        }
    }

    @Transactional
    public void updateUserAdminStatus(Long userId, boolean isAdmin) {
        Optional<User> userOptional = userRepository.findById(userId);
        if (userOptional.isPresent()) {
            User user = userOptional.get();

            // Ensure at least **one admin remains** in the system
            Long adminCount = userRepository.countByIsAdminTrue();
            if (!isAdmin && adminCount == 1) {
                throw new RuntimeException("Cannot remove the last admin!");
            }

            user.setAdmin(isAdmin);
            userRepository.save(user);
        } else {
            throw new RuntimeException("User not found");
        }
    }

    public Long getUserIdFromToken(String authorizationHeader) {
        String email = jwtUtil.extractEmailFromHeader(authorizationHeader);
        if (email == null)
            return null;

        return userRepository.findByEmail(email)
                .map(User::getId)
                .orElse(null);
    }

    public Optional<User> getUserFromToken(String authorizationHeader) {
        String email = jwtUtil.extractEmailFromHeader(authorizationHeader);
        return email != null ? userRepository.findByEmail(email) : Optional.empty();
    }

    @Transactional
    public void updateUserProfile(String authorizationHeader, UserDto userDto) {
        Optional<User> userOptional = getUserFromToken(authorizationHeader);

        if (userOptional.isEmpty()) {
            throw new RuntimeException("User not found or unauthorized");
        }

        User user = userOptional.get();

        // Update fields except password
        if (userDto.getFirstName() != null)
            user.setFirstName(userDto.getFirstName());
        if (userDto.getLastName() != null)
            user.setLastName(userDto.getLastName());
        if (userDto.getEmail() != null)
            user.setEmail(userDto.getEmail());
        if (userDto.getBirthday() != null)
            user.setBirthday(userDto.getBirthday());
        if (userDto.getProfileImage() != null)
            user.setProfileImage(userDto.getProfileImage());

        userRepository.save(user);
    }

}
