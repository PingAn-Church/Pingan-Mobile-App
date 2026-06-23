package com.fyp.backend.controller;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fyp.backend.dto.UserDto;
import com.fyp.backend.dto.UserProfileDto;
import com.fyp.backend.dto.UserSummaryDto;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.RedisService;
import com.fyp.backend.service.UserAccountDeletionService;
import com.fyp.backend.service.UserService;
import com.fyp.backend.util.JwtUtil;
import com.fyp.backend.util.Pagination;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private RedisService redisService;

    @Autowired
    private UserService userService;

    @Autowired
    private UserAccountDeletionService userAccountDeletionService;

    // @GetMapping("/profile")
    // public ResponseEntity<UserProfileDto>
    // getUserProfile(@RequestHeader("Authorization") String authorizationHeader) {
    // // Extract token from Authorization header
    // String token = authorizationHeader.substring(7); // Remove "Bearer " prefix
    // String email = jwtUtil.extractEmail(token); // Extract the email from the
    // token
    //
    // // Find the user by email
    // Optional<User> userOptional = userRepository.findByEmail(email);
    // if (userOptional.isPresent()) {
    // User user = userOptional.get();
    //
    // // Create and return the UserProfileDto
    // UserProfileDto userProfile = new UserProfileDto(
    // user.getId(),
    // user.getFirstName(),
    // user.getLastName(),
    // user.getEmail(),
    // user.getProfileImage(),
    // user.isVerifiedUser(),
    // user.isAdmin()
    // );
    // return ResponseEntity.ok(userProfile);
    // } else {
    // return ResponseEntity.status(404).body(null); // User not found
    // }
    // }

//    @GetMapping("/profile")
//    public ResponseEntity<UserProfileDto> getUserProfile(@RequestHeader("Authorization") String authorizationHeader) {
//        return userService.getUserFromToken(authorizationHeader)
//                .map(user -> new UserProfileDto(
//                        user.getId(),
//                        user.getFirstName(),
//                        user.getLastName(),
//                        user.getEmail(),
//                        user.getProfileImage(),
//                        user.isVerifiedUser(),
//                        user.isAdmin(),
//                        user.getBirthday()))
//                .map(ResponseEntity::ok)
//                .orElse(ResponseEntity.status(404).body(null));
//    }

    @GetMapping("/profile")
    public ResponseEntity<UserProfileDto> getUserProfile(@RequestHeader("Authorization") String authorizationHeader) {
        return userService.getUserProfileFromHeader(authorizationHeader)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(404).body(null));
    }


    @GetMapping("/{userId}")
    public ResponseEntity<UserProfileDto> getUserById(@PathVariable Long userId) {
        Optional<User> userOptional = userRepository.findById(userId);
        if (userOptional.isPresent()) {
            User user = userOptional.get();
            return ResponseEntity.ok(UserProfileDto.from(user));
        } else {
            return ResponseEntity.status(404).body(null); // User not found
        }
    }

    // New endpoint to get all users (excluding the currently logged-in user)
    /**
     * Directory search for chat pickers: any authenticated user, paginated, and
     * limited to minimal fields (no email). Empty query returns the first page of
     * active users so pickers can show an initial list.
     */
    @GetMapping("/search")
    public ResponseEntity<Map<String, Object>> searchUsers(
            @RequestParam(required = false, defaultValue = "") String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        int safeSize = Pagination.clampSize(size);
        int safePage = Pagination.clampPage(page);
        Pageable pageable = PageRequest.of(safePage, safeSize,
                Sort.by("firstName").ascending().and(Sort.by("id").ascending()));

        String term = q == null ? "" : q.trim();
        Page<User> result = term.isEmpty()
                ? userRepository.findByActiveTrue(pageable)
                : userRepository.searchActiveByName(term, pageable);

        List<UserSummaryDto> data = result.getContent().stream()
                .map(UserSummaryDto::from)
                .collect(Collectors.toList());

        Map<String, Object> pagination = new LinkedHashMap<>();
        pagination.put("page", safePage);
        pagination.put("size", safeSize);
        pagination.put("totalCount", result.getTotalElements());
        pagination.put("hasMore", result.hasNext());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("data", data);
        body.put("pagination", pagination);
        return ResponseEntity.ok(body);
    }

    // Full directory with emails is admin-only; normal users use /search (no PII).
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping
    public ResponseEntity<List<UserProfileDto>> getAllUsers(
            @RequestHeader("Authorization") String authorizationHeader) {
        // Extract token from Authorization header
        String token = authorizationHeader.substring(7); // Remove "Bearer " prefix
        String email = jwtUtil.extractEmail(token); // Extract the email from the token

        // Find the user by email
        Optional<User> userOptional = userRepository.findByEmail(email);
        if (!userOptional.isPresent()) {
            return ResponseEntity.status(404).body(null); // User not found
        }

        User currentUser = userOptional.get();

        // Fetch all users from the repository, excluding the current user
        List<User> allUsers = userRepository.findAll();
        List<UserProfileDto> usersWithoutCurrentUser = allUsers.stream()
                .filter(user -> !user.getId().equals(currentUser.getId())) // Exclude the current user
                .filter(User::isActive) // Hide deactivated accounts
                .map(UserProfileDto::from)
                .collect(Collectors.toList());

        return ResponseEntity.ok(usersWithoutCurrentUser);
    }

    // Presence is stored by email internally, but exposed keyed by user id so the
    // client never needs emails to resolve online status (no PII over the wire).
    @GetMapping("/online-users")
    public ResponseEntity<Map<String, String>> getOnlineUsers() {
        Map<String, String> onlineByEmail = redisService.getAllOnlineUsers();
        if (onlineByEmail.isEmpty()) {
            return ResponseEntity.ok(Map.of());
        }
        Map<String, String> onlineById = new LinkedHashMap<>();
        for (User u : userRepository.findByEmailIn(onlineByEmail.keySet())) {
            if ("online".equals(onlineByEmail.get(u.getEmail()))) {
                onlineById.put(String.valueOf(u.getId()), "online");
            }
        }
        return ResponseEntity.ok(onlineById);
    }

    @GetMapping("/verified")
    public ResponseEntity<List<UserProfileDto>> getVerifiedUsers() {
        List<User> verifiedUsers = userService.findVerifiedUsers();

        List<UserProfileDto> userDtos = verifiedUsers.stream()
                .map(UserProfileDto::from)
                .collect(Collectors.toList());

        return ResponseEntity.ok(userDtos);
    }

    @GetMapping("/admins")
    public ResponseEntity<List<UserProfileDto>> getAdminUsers() {
        List<User> adminUsers = userService.findAdmins();

        List<UserProfileDto> adminDtos = adminUsers.stream()
                .map(UserProfileDto::from)
                .collect(Collectors.toList());

        return ResponseEntity.ok(adminDtos);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/update-verified/{id}")
    public ResponseEntity<String> updateUserVerifiedStatus(
            @PathVariable Long id,
            @RequestParam boolean isVerifiedUser) {
        userService.updateUserVerifiedStatus(id, isVerifiedUser);
        return ResponseEntity.ok("User verification status updated!");
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/update-admin/{id}")
    public ResponseEntity<String> updateUserAdminStatus(
            @PathVariable Long id,
            @RequestParam boolean isAdmin) {
        userService.updateUserAdminStatus(id, isAdmin);
        return ResponseEntity.ok("User admin status updated!");
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/inactive")
    public ResponseEntity<List<UserProfileDto>> getInactiveUsers() {
        List<UserProfileDto> inactive = userService.findInactiveUsers().stream()
                .map(UserProfileDto::from)
                .collect(Collectors.toList());
        return ResponseEntity.ok(inactive);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/update-active/{id}")
    public ResponseEntity<String> updateUserActiveStatus(
            @PathVariable Long id,
            @RequestParam boolean active) {
        try {
            userService.updateUserActiveStatus(id, active);
            return ResponseEntity.ok("User active status updated!");
        } catch (RuntimeException e) {
            return ResponseEntity.status(400).body(e.getMessage());
        }
    }

    // Permanently delete a deactivated user and ALL their associated data (chat,
    // quiz attempts, progress, OSS media, etc.). Irreversible; admin-only. The
    // service guards that the target is inactive and not an admin.
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<String> deleteUser(@PathVariable Long id) {
        try {
            userAccountDeletionService.deleteUserCompletely(id);
            return ResponseEntity.ok("User and associated data permanently deleted.");
        } catch (RuntimeException e) {
            return ResponseEntity.status(400).body(e.getMessage());
        }
    }

    @GetMapping("/instructors")
    public ResponseEntity<List<UserProfileDto>> getInstructorUsers() {
        List<UserProfileDto> instructors = userService.findInstructors().stream()
                .map(UserProfileDto::from)
                .collect(Collectors.toList());
        return ResponseEntity.ok(instructors);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/update-instructor/{id}")
    public ResponseEntity<String> updateUserInstructorStatus(
            @PathVariable Long id,
            @RequestParam boolean isInstructor) {
        userService.updateUserInstructorStatus(id, isInstructor);
        return ResponseEntity.ok("User instructor status updated!");
    }

    @PutMapping("/profile")
    public ResponseEntity<String> updateUserProfile(
            @RequestHeader("Authorization") String authorizationHeader,
            @RequestBody UserDto userDto) {
        try {
            userService.updateUserProfile(authorizationHeader, userDto);
            return ResponseEntity.ok("Profile updated successfully!");
        } catch (RuntimeException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        }
    }

}
