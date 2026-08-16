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
import org.springframework.http.HttpStatus;
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
import com.fyp.backend.service.AdminAlertService;
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

    @Autowired
    private AdminAlertService adminAlertService;

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

    /**
     * The public face of a member: name, avatar and roles, nothing else.
     *
     * Deliberately separate from GET /{userId}, which returns the full profile
     * including their email — this backs the in-app profile screen anyone can
     * open from a group message, so it must not hand out contact details.
     */
    @GetMapping("/{userId}/summary")
    public ResponseEntity<UserSummaryDto> getUserSummary(@PathVariable Long userId) {
        return userRepository.findById(userId)
                .map(UserSummaryDto::from)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(404).body(null));
    }

    // New endpoint to get all users (excluding the currently logged-in user)
    /**
     * Directory search for chat pickers: any authenticated user, paginated, and
     * limited to minimal fields (no email). Only admin-verified users are listed —
     * unverified accounts can't use chat, so they're hidden here too. Empty query
     * returns the first page of verified users so pickers can show an initial list.
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
                ? userRepository.findByActiveTrueAndDeletedAccountFalseAndIsVerifiedUserTrue(pageable)
                : userRepository.searchActiveVerifiedByName(term, pageable);

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
    public ResponseEntity<Map<String, Object>> getAllUsers(
            @RequestParam(required = false, defaultValue = "") String q,
            @RequestParam(required = false) Boolean verified,
            @RequestParam(required = false, defaultValue = "true") Boolean active,
            @RequestParam(required = false) String role,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = userPage(page, size);
        Page<User> result = userService.searchUsers(q, verified, active, role, false, pageable);
        return ResponseEntity.ok(userEnvelope(result));
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

    /**
     * How many accounts have registered since this admin last opened the user
     * list — the number behind the admin badge. Per-caller, so two admins clear
     * it independently.
     */
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/new-members/count")
    public ResponseEntity<Map<String, Object>> getNewMemberCount(
            @RequestHeader("Authorization") String authorizationHeader) {
        Long adminId = userService.getUserIdFromToken(authorizationHeader);
        if (adminId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false));
        }
        return ResponseEntity.ok(Map.of(
                "success", true,
                "count", adminAlertService.unseenNewMemberCount(adminId)));
    }

    /** Clears this admin's badge; called when they open the user list. */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/new-members/seen")
    public ResponseEntity<Map<String, Object>> markNewMembersSeen(
            @RequestHeader("Authorization") String authorizationHeader) {
        Long adminId = userService.getUserIdFromToken(authorizationHeader);
        if (adminId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("success", false));
        }
        adminAlertService.markNewMembersSeen(adminId);
        return ResponseEntity.ok(Map.of("success", true, "count", 0));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/verified")
    public ResponseEntity<Map<String, Object>> getVerifiedUsers(
            @RequestParam(required = false, defaultValue = "") String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<User> result = userService.searchUsers(q, true, true, null, false, userPage(page, size));
        return ResponseEntity.ok(userEnvelope(result));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admins")
    public ResponseEntity<Map<String, Object>> getAdminUsers(
            @RequestParam(required = false, defaultValue = "") String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<User> result = userService.searchUsers(q, null, true, "admin", false, userPage(page, size));
        return ResponseEntity.ok(userEnvelope(result));
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
        try {
            userService.updateUserAdminStatus(id, isAdmin);
        } catch (UserService.LastAdminException e) {
            // 409 lets the client tell "last admin" apart from a generic failure.
            return ResponseEntity.status(409).body(e.getMessage());
        }
        return ResponseEntity.ok("User admin status updated!");
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/inactive")
    public ResponseEntity<Map<String, Object>> getInactiveUsers(
            @RequestParam(required = false, defaultValue = "") String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<User> result = userService.searchUsers(q, null, false, null, false, userPage(page, size));
        return ResponseEntity.ok(userEnvelope(result));
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

    /**
     * Records the app language of the caller's device.
     *
     * Push notification text is composed server-side and rendered by the OS, so
     * the backend has to know which language to write in; the app reports its
     * current choice here on sign-in and whenever the user toggles it.
     */
    @PutMapping("/me/language")
    public ResponseEntity<String> updateOwnLanguage(
            @RequestHeader("Authorization") String authorizationHeader,
            @RequestBody Map<String, String> body) {
        Long userId = userService.getUserIdFromToken(authorizationHeader);
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Unauthorized");
        }

        String requested = body == null ? null : body.get("language");
        String language = requested == null ? "" : requested.trim().toLowerCase();
        if (!language.equals("en") && !language.equals("zh")) {
            return ResponseEntity.badRequest().body("Unsupported language.");
        }

        return userRepository.findById(userId)
                .map(user -> {
                    user.setLanguage(language);
                    userRepository.save(user);
                    return ResponseEntity.ok("Language updated.");
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body("User not found."));
    }

    @DeleteMapping("/me")
    public ResponseEntity<String> deleteOwnAccount(@RequestHeader("Authorization") String authorizationHeader) {
        Long userId = userService.getUserIdFromToken(authorizationHeader);
        if (userId == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Unauthorized");
        }
        try {
            userAccountDeletionService.deleteOwnAccount(userId);
            return ResponseEntity.ok("Account deleted.");
        } catch (RuntimeException e) {
            return ResponseEntity.status(400).body(e.getMessage());
        }
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/instructors")
    public ResponseEntity<Map<String, Object>> getInstructorUsers(
            @RequestParam(required = false, defaultValue = "") String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Page<User> result = userService.searchUsers(q, null, true, "instructor", false, userPage(page, size));
        return ResponseEntity.ok(userEnvelope(result));
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
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (RuntimeException e) {
            return ResponseEntity.status(403).body(e.getMessage());
        }
    }

    private Pageable userPage(int page, int size) {
        return PageRequest.of(
                Pagination.clampPage(page),
                Pagination.clampSize(size),
                Sort.by("firstName").ascending().and(Sort.by("lastName").ascending()).and(Sort.by("id").ascending()));
    }

    private Map<String, Object> userEnvelope(Page<User> page) {
        List<UserProfileDto> data = page.getContent().stream()
                .map(UserProfileDto::from)
                .collect(Collectors.toList());
        return Pagination.envelope(data, page);
    }

}
