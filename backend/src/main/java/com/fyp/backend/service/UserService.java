package com.fyp.backend.service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.dto.UserDto;
import com.fyp.backend.dto.UserProfileDto;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;

import jakarta.persistence.criteria.Predicate;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private RedisService redisService;

    @Autowired
    private OssCleanupService ossCleanupService;

    @Autowired
    private AdminAlertService adminAlertService;

    @Autowired
    private AppGroupChatService appGroupChatService;

    @Autowired
    private PermissionBroadcaster permissionBroadcaster;

    /**
     * Retrieves the user profile of the currently authenticated user.
     * 
     * @param token The JWT authorization token.
     * @return UserProfileDto if found, otherwise null.
     */

    public Optional<UserProfileDto> getUserProfileFromHeader(String authorizationHeader) {
        String email = jwtUtil.extractEmailFromHeader(authorizationHeader);
        if (email == null) return Optional.empty();

        return userRepository.findByEmail(email)
                .map(UserProfileDto::from);
    }

    /**
     * Retrieves a user's profile by user ID.
     * 
     * @param userId The ID of the user.
     * @return UserProfileDto if found, otherwise null.
     */
    public Optional<UserProfileDto> getUserById(Long userId) {
        Optional<User> userOptional = userRepository.findById(userId);
        return userOptional.map(UserProfileDto::from);
    }

    /**
     * Retrieves a map of all online users.
     * 
     * @return Map of online users.
     */
    public Map<String, String> getOnlineUsers() {
        return redisService.getAllOnlineUsers();
    }

    @Transactional(readOnly = true)
    public Page<User> searchUsers(String q, Boolean verified, Boolean active, String role,
            Boolean deletedAccount, Pageable pageable) {
        return userRepository.findAll(userFilter(q, verified, active, role, deletedAccount), pageable);
    }

    private Specification<User> userFilter(String q, Boolean verified, Boolean active, String role,
            Boolean deletedAccount) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new java.util.ArrayList<>();

            // The assistant is a user row, but it is not a member: it must not
            // appear in the directory, the admin member lists, role management,
            // "start a new chat", or add-participants. The mention picker offers
            // it from the conversation instead (ConversationDto.assistantId), so
            // nothing legitimate needs it here.
            predicates.add(cb.isFalse(root.get("bot")));

            if (deletedAccount != null) {
                predicates.add(cb.equal(root.get("deletedAccount"), deletedAccount));
            }
            if (verified != null) {
                predicates.add(cb.equal(root.get("isVerifiedUser"), verified));
            }
            if (active != null) {
                predicates.add(cb.equal(root.get("active"), active));
            }

            String normalizedRole = role == null ? "" : role.trim().toLowerCase();
            switch (normalizedRole) {
                case "admin" -> predicates.add(cb.equal(root.get("isAdmin"), true));
                case "instructor" -> predicates.add(cb.equal(root.get("isInstructor"), true));
                case "verified" -> predicates.add(cb.equal(root.get("isVerifiedUser"), true));
                case "user", "non-admin" -> predicates.add(cb.equal(root.get("isAdmin"), false));
                default -> {
                }
            }

            String term = q == null ? "" : q.trim().toLowerCase();
            if (!term.isEmpty()) {
                String like = "%" + term + "%";
                Predicate textMatch = cb.or(
                        cb.like(cb.lower(root.get("firstName")), like),
                        cb.like(cb.lower(root.get("lastName")), like),
                        cb.like(cb.lower(cb.concat(cb.concat(root.get("firstName"), " "), root.get("lastName"))), like),
                        cb.like(cb.lower(root.get("email")), like));

                try {
                    Long id = Long.parseLong(term);
                    predicates.add(cb.or(textMatch, cb.equal(root.get("id"), id)));
                } catch (NumberFormatException ignored) {
                    predicates.add(textMatch);
                }
            }

            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /** Whether an account exists and is active (used to gate login/refresh). */
    public boolean isAccountActive(String email) {
        return userRepository.findByEmail(email).map(User::isActive).orElse(false);
    }

    @Transactional
    public void updateUserInstructorStatus(Long userId, boolean isInstructor) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (user.isDeletedAccount()) {
            throw new RuntimeException("Deleted accounts cannot be granted instructor status.");
        }
        user.setInstructor(isInstructor);
        userRepository.save(user);
        permissionBroadcaster.announce(user);
    }

    @Transactional
    public void updateUserVerifiedStatus(Long userId, boolean isVerifiedUser) {
        Optional<User> userOptional = userRepository.findById(userId);
        if (userOptional.isPresent()) {
            User user = userOptional.get();
            if (user.isDeletedAccount()) {
                throw new RuntimeException("Deleted accounts cannot be verified.");
            }
            user.setVerifiedUser(isVerifiedUser);
            userRepository.save(user);
            // Verification is what membership of the app-level group is derived
            // from, so it has to move with it — the group is waiting in their chat
            // list the moment they are approved, and gone again if that is undone.
            appGroupChatService.syncMembership(user);
            // The app hides chat, events and the whole verified surface behind this
            // flag, so being approved has to light them up now rather than at the
            // next poll or the next sign-in.
            permissionBroadcaster.announce(user);
        } else {
            throw new RuntimeException("User not found");
        }
    }

    @Transactional
    public void updateUserActiveStatus(Long userId, boolean active) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        // Admins must be downgraded before deactivation, so the account lifecycle
        // can't strand the system without an admin.
        if (!active && user.isAdmin()) {
            throw new RuntimeException("Downgrade this admin before deactivating the account.");
        }
        if (user.isDeletedAccount()) {
            throw new RuntimeException("Deleted accounts cannot be reactivated.");
        }
        user.setActive(active);
        userRepository.save(user);
        // A deactivated account keeps its verified flag but must stop receiving the
        // public group's traffic.
        appGroupChatService.syncMembership(user);
        permissionBroadcaster.announce(user);
    }

    @Transactional
    public void updateUserAdminStatus(Long userId, boolean isAdmin) {
        Optional<User> userOptional = userRepository.findById(userId);
        if (userOptional.isPresent()) {
            User user = userOptional.get();
            if (user.isDeletedAccount()) {
                throw new RuntimeException("Deleted accounts cannot be granted admin status.");
            }

            // Ensure at least **one admin remains** in the system
            Long adminCount = userRepository.countByIsAdminTrue();
            if (!isAdmin && user.isAdmin() && adminCount <= 1) {
                throw new LastAdminException("Cannot remove the last admin!");
            }

            user.setAdmin(isAdmin);
            // A new admin starts from today's membership, not from a badge
            // counting everyone who ever joined.
            if (isAdmin) {
                adminAlertService.startTrackingNewMembers(user);
            }
            userRepository.save(user);
            // Admin powers in the app-level group follow app admin rather than a
            // separate per-group list, so the two must not drift apart.
            appGroupChatService.syncAdmin(user);
            permissionBroadcaster.announce(user);
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
        if (user.isDeletedAccount()) {
            throw new RuntimeException("Deleted accounts cannot be edited.");
        }
        if (userDto.getEmail() != null && !user.getEmail().equalsIgnoreCase(userDto.getEmail().trim())) {
            throw new IllegalArgumentException("Email changes require a dedicated verification flow.");
        }

        // Update fields except password
        if (userDto.getFirstName() != null)
            user.setFirstName(userDto.getFirstName());
        if (userDto.getLastName() != null)
            user.setLastName(userDto.getLastName());
        if (userDto.getBirthday() != null)
            user.setBirthday(userDto.getBirthday());
        String previousProfileImage = user.getProfileImage();
        if (userDto.getProfileImage() != null)
            user.setProfileImage(userDto.getProfileImage());

        userRepository.save(user);
        if (userDto.getProfileImage() != null
                && !java.util.Objects.equals(previousProfileImage, user.getProfileImage())) {
            ossCleanupService.deleteAfterCommit(previousProfileImage);
        }
    }

    /** Demoting the last remaining admin is refused so the system can't lock itself out. */
    public static class LastAdminException extends RuntimeException {
        public LastAdminException(String message) {
            super(message);
        }
    }

}
