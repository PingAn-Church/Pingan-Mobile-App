package com.fyp.backend.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Logger;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.dto.DeletedAccountDto;
import com.fyp.backend.model.Certificate;
import com.fyp.backend.model.Course;
import com.fyp.backend.model.CourseEnrollment;
import com.fyp.backend.model.CourseRating;
import com.fyp.backend.model.Event;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageDeliveryStatus;
import com.fyp.backend.model.MessageReport;
import com.fyp.backend.model.PrivateConversation;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CertificateRepository;
import com.fyp.backend.repository.CourseEnrollmentRepository;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseWishlistRepository;
import com.fyp.backend.repository.EventRepository;
import com.fyp.backend.repository.FormApplicationRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.LearningGoalRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageReportRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.repository.QuizAttemptRepository;
import com.fyp.backend.repository.RefreshTokenRepository;
import com.fyp.backend.repository.ResourceProgressRepository;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserAchievementRepository;
import com.fyp.backend.repository.UserAnalyticsRepository;
import com.fyp.backend.repository.UserBlockRepository;
import com.fyp.backend.repository.UserModuleProgressRepository;
import com.fyp.backend.repository.UserPreferencesRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.repository.UserVideoProgressRepository;

/**
 * Account lifecycle cleanup. There are two intentionally different paths:
 *
 * <p>Admin hard-delete removes an inactive, non-admin account and every FK row
 * that blocks deleting the {@code users} row.
 *
 * <p>Self-delete anonymizes the original {@code users} row into an immutable
 * Deleted Account tombstone. Shared UGC such as chat messages and forum posts
 * stays readable, while personal profile/device/learning data is removed.
 */
@Service
public class UserAccountDeletionService {

    private static final Logger LOGGER = Logger.getLogger(UserAccountDeletionService.class.getName());
    private static final String DELETED_FIRST_NAME = "Deleted";
    private static final String DELETED_LAST_NAME = "Account";
    private static final String DELETED_DISPLAY_NAME = "Deleted Account";

    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private OSSService ossService;
    @Autowired private RedisService redisService;
    @Autowired private ReviewService reviewService;

    // Chat
    @Autowired private PrivateConversationRepository privateConversationRepository;
    @Autowired private GroupConversationRepository groupConversationRepository;
    @Autowired private MessageRepository messageRepository;
    @Autowired private MessageDeliveryStatusRepository messageDeliveryStatusRepository;

    // Auth / devices
    @Autowired private PushTokenRepository pushTokenRepository;
    @Autowired private RefreshTokenRepository refreshTokenRepository;

    // Blocking and reports
    @Autowired private UserBlockRepository userBlockRepository;
    @Autowired private MessageReportRepository messageReportRepository;

    // Forum
    @Autowired private ThreadRepository threadRepository;
    @Autowired private ThreadReplyRepository threadReplyRepository;

    // Events / forms
    @Autowired private EventRepository eventRepository;
    @Autowired private FormApplicationRepository formApplicationRepository;

    // E-learning
    @Autowired private CourseRepository courseRepository;
    @Autowired private QuizAttemptRepository quizAttemptRepository;
    @Autowired private CourseEnrollmentRepository courseEnrollmentRepository;
    @Autowired private CourseWishlistRepository courseWishlistRepository;
    @Autowired private CertificateRepository certificateRepository;
    @Autowired private LearningGoalRepository learningGoalRepository;
    @Autowired private UserAnalyticsRepository userAnalyticsRepository;
    @Autowired private UserModuleProgressRepository userModuleProgressRepository;
    @Autowired private UserVideoProgressRepository userVideoProgressRepository;
    @Autowired private ResourceProgressRepository resourceProgressRepository;
    @Autowired private UserAchievementRepository userAchievementRepository;
    @Autowired private CourseRatingRepository courseRatingRepository;
    @Autowired private UserPreferencesRepository userPreferencesRepository;

    /**
     * Permanently delete a deactivated user and all associated data.
     *
     * @throws RuntimeException if the user is missing, still active, an admin, or
     *         already an anonymized Deleted Account tombstone.
     */
    @Transactional
    public void deleteUserCompletely(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.isDeletedAccount()) {
            throw new RuntimeException("Deleted accounts must be purged from the Deleted Accounts section.");
        }
        if (user.isAdmin()) {
            throw new RuntimeException("Cannot delete an admin account. Downgrade it first.");
        }
        if (user.isActive()) {
            throw new RuntimeException("Only deactivated (inactive) users can be permanently deleted.");
        }

        String email = user.getEmail();
        String profileImage = user.getProfileImage();
        Set<Long> affectedCourseIds = collectLearningCourseIds(userId);
        deleteCertificateAssets(userId, affectedCourseIds);

        for (PrivateConversation pc : privateConversationRepository.findByUserId(userId)) {
            purgeConversationMessages(pc.getId());
            privateConversationRepository.delete(pc);
        }

        Set<Long> handledGroups = new HashSet<>();
        for (GroupConversation g : groupConversationRepository.findByParticipantId(userId)) {
            purgeUserFromGroup(g, userId, true);
            handledGroups.add(g.getId());
        }
        for (GroupConversation g : groupConversationRepository.findByAdminId(userId)) {
            if (handledGroups.add(g.getId())) {
                purgeUserFromGroup(g, userId, true);
            }
        }

        messageRepository.deleteReadReceiptsByUserId(userId);
        messageDeliveryStatusRepository.deleteByUserId(userId);

        threadReplyRepository.deleteByAuthorId(userId);
        for (Thread t : threadRepository.findByCreatedById(userId)) {
            threadRepository.delete(t);
        }

        pushTokenRepository.deleteByUserId(userId);
        refreshTokenRepository.deleteByUserEmail(email);
        redisService.clearUserOnlineStatus(email);
        userBlockRepository.deleteByBlockerIdOrBlockedId(userId, userId);
        formApplicationRepository.deleteByContactIgnoreCase(email);
        scrubEventCheckins(userId);
        anonymizeReports(userId);
        detachAuthoredCourses(userId);
        deleteLearningRows(userId);

        ossService.deleteObjectByUrl(profileImage);
        userRepository.deleteById(userId);
        recomputeAffectedCourses(affectedCourseIds);

        LOGGER.info("Permanently deleted user " + userId + " and all associated data.");
    }

    /**
     * User-requested deletion: clear private data, keep shared UGC reachable via
     * the same users row, and invalidate all future auth for the old email.
     */
    @Transactional
    public void deleteOwnAccount(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.isDeletedAccount()) {
            throw new RuntimeException("This account has already been deleted.");
        }
        if (user.isAdmin()) {
            throw new RuntimeException("Admin accounts must be downgraded before they can be deleted.");
        }

        String oldEmail = user.getEmail();
        String profileImage = user.getProfileImage();
        Set<Long> affectedCourseIds = collectLearningCourseIds(userId);
        deleteCertificateAssets(userId, affectedCourseIds);

        removeFromGroupConversations(userId);
        messageRepository.deleteReadReceiptsByUserId(userId);
        messageDeliveryStatusRepository.deleteByUserId(userId);

        pushTokenRepository.deleteByUserId(userId);
        refreshTokenRepository.deleteByUserEmail(oldEmail);
        redisService.clearUserOnlineStatus(oldEmail);
        userBlockRepository.deleteByBlockerIdOrBlockedId(userId, userId);
        formApplicationRepository.deleteByContactIgnoreCase(oldEmail);
        scrubEventCheckins(userId);
        anonymizeReports(userId);
        detachAuthoredCourses(userId);
        deleteLearningRows(userId);
        ossService.deleteObjectByUrl(profileImage);

        User managedUser = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        anonymizeUser(managedUser);
        recomputeAffectedCourses(affectedCourseIds);

        LOGGER.info("Anonymized deleted account " + userId + " and removed associated private data.");
    }

    @Transactional(readOnly = true)
    public List<DeletedAccountDto> listDeletedAccounts() {
        return userRepository.findByDeletedAccountTrueOrderByDeletedAtDescIdAsc().stream()
                .map(user -> DeletedAccountDto.from(user, referenceSummary(user)))
                .toList();
    }

    @Transactional
    public void purgeDeletedAccount(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        if (!user.isDeletedAccount()) {
            throw new RuntimeException("Only Deleted Account tombstones can be purged here.");
        }

        Map<String, Long> references = referenceSummary(user);
        long referenceCount = references.values().stream().mapToLong(Long::longValue).sum();
        if (referenceCount > 0) {
            throw new DeletedAccountStillReferencedException(references);
        }

        userRepository.delete(user);
        LOGGER.info("Purged unreferenced Deleted Account tombstone " + userId + ".");
    }

    @Transactional(readOnly = true)
    public Map<String, Long> referenceSummary(User user) {
        Long userId = user.getId();
        Map<String, Long> refs = new LinkedHashMap<>();
        putIfNonZero(refs, "privateConversations", privateConversationRepository.countByUserId(userId));
        putIfNonZero(refs, "groupMemberships", groupConversationRepository.countByParticipantId(userId));
        putIfNonZero(refs, "groupAdminRoles", groupConversationRepository.countByAdminId(userId));
        putIfNonZero(refs, "messages", messageRepository.countBySenderId(userId));
        putIfNonZero(refs, "messageReadReceipts", messageRepository.countReadReceiptsByUserId(userId));
        putIfNonZero(refs, "messageDeliveryStatuses", messageDeliveryStatusRepository.countByUserId(userId));
        putIfNonZero(refs, "threads", threadRepository.countByCreatedById(userId));
        putIfNonZero(refs, "threadReplies", threadReplyRepository.countByAuthorId(userId));
        putIfNonZero(refs, "eventCheckIns", eventRepository.countByCheckedInUserId(userId));
        putIfNonZero(refs, "blocks", userBlockRepository.countByBlockerIdOrBlockedId(userId, userId));
        putIfNonZero(refs, "messageReports",
                messageReportRepository.countBySenderIdOrReporterIdOrResolvedById(userId, userId, userId));
        putIfNonZero(refs, "pushTokens", pushTokenRepository.countByUserId(userId));
        putIfNonZero(refs, "refreshTokens", refreshTokenRepository.countByUserEmail(user.getEmail()));
        putIfNonZero(refs, "formApplications", formApplicationRepository.countByContactIgnoreCase(user.getEmail()));
        putIfNonZero(refs, "authoredCourses", courseRepository.countByInstructorId(userId));
        putIfNonZero(refs, "learningRecords", countLearningRows(userId));
        return refs;
    }

    private void removeFromGroupConversations(Long userId) {
        Set<Long> handledGroups = new HashSet<>();
        for (GroupConversation g : groupConversationRepository.findByParticipantId(userId)) {
            purgeUserFromGroup(g, userId, false);
            handledGroups.add(g.getId());
        }
        for (GroupConversation g : groupConversationRepository.findByAdminId(userId)) {
            if (handledGroups.add(g.getId())) {
                purgeUserFromGroup(g, userId, false);
            }
        }
    }

    private Set<Long> collectLearningCourseIds(Long userId) {
        Set<Long> courseIds = new HashSet<>();
        for (CourseEnrollment e : courseEnrollmentRepository.findByUserId(userId)) {
            courseIds.add(e.getCourseId());
        }
        for (CourseRating r : courseRatingRepository.findByUserId(userId)) {
            courseIds.add(r.getCourseId());
        }
        return courseIds;
    }

    private void deleteCertificateAssets(Long userId, Set<Long> affectedCourseIds) {
        for (Certificate c : certificateRepository.findByUserId(userId)) {
            if (c.getCourseId() != null) {
                affectedCourseIds.add(c.getCourseId());
            }
            ossService.deleteObjectByUrl(c.getCredentialUrl());
        }
    }

    private void deleteLearningRows(Long userId) {
        quizAttemptRepository.deleteByUserId(userId);
        courseEnrollmentRepository.deleteByUserId(userId);
        courseWishlistRepository.deleteByUserId(userId);
        certificateRepository.deleteByUserId(userId);
        learningGoalRepository.deleteByUserId(userId);
        userAnalyticsRepository.deleteByUserId(userId);
        userModuleProgressRepository.deleteByUserId(userId);
        userVideoProgressRepository.deleteByUserId(userId);
        resourceProgressRepository.deleteByUserId(userId);
        userAchievementRepository.deleteByUserId(userId);
        courseRatingRepository.deleteByUserId(userId);
        userPreferencesRepository.deleteByUserId(userId);
    }

    private long countLearningRows(Long userId) {
        return quizAttemptRepository.countByUserId(userId)
                + courseEnrollmentRepository.countByUserId(userId)
                + courseWishlistRepository.countByUserId(userId)
                + certificateRepository.countByUserId(userId)
                + learningGoalRepository.countByUserId(userId)
                + userAnalyticsRepository.countByUserId(userId)
                + userModuleProgressRepository.countByUserId(userId)
                + userVideoProgressRepository.countByUserId(userId)
                + resourceProgressRepository.countByUserId(userId)
                + userAchievementRepository.countByUserId(userId)
                + courseRatingRepository.countByUserId(userId)
                + userPreferencesRepository.countByUserId(userId);
    }

    private void scrubEventCheckins(Long userId) {
        for (Event e : eventRepository.findByCheckedInUserId(userId)) {
            List<Long> ids = e.getCheckedInUserIds();
            if (ids != null && ids.removeIf(id -> userId.equals(id))) {
                e.setCheckedInUserIds(ids);
                eventRepository.save(e);
            }
        }
    }

    private void anonymizeReports(Long userId) {
        for (MessageReport report : messageReportRepository
                .findBySenderIdOrReporterIdOrResolvedById(userId, userId, userId)) {
            if (userId.equals(report.getSenderId())) {
                report.setSenderId(null);
                report.setSenderName(DELETED_DISPLAY_NAME);
            }
            if (userId.equals(report.getReporterId())) {
                report.setReporterId(null);
                report.setReporterName(DELETED_DISPLAY_NAME);
            }
            if (userId.equals(report.getResolvedById())) {
                report.setResolvedById(null);
                report.setResolvedByName(DELETED_DISPLAY_NAME);
            }
            messageReportRepository.save(report);
        }
    }

    private void detachAuthoredCourses(Long userId) {
        for (Course course : courseRepository.findByInstructorId(userId)) {
            course.setInstructorId(null);
            course.setInstructorName(DELETED_DISPLAY_NAME);
            courseRepository.save(course);
        }
    }

    private void recomputeAffectedCourses(Set<Long> courseIds) {
        for (Long courseId : courseIds) {
            courseRepository.findById(courseId).ifPresent(course -> {
                long count = courseEnrollmentRepository.countByCourseId(courseId);
                course.setStudentCount(count > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) count);
                courseRepository.save(course);
            });
            reviewService.recomputeCourseRating(courseId);
        }
    }

    /** Delete every message in a conversation (media + delivery statuses + read receipts). */
    private void purgeConversationMessages(Long conversationId) {
        List<Message> messages = messageRepository.findByConversationId(conversationId);
        for (Message m : messages) {
            deleteMessageMedia(m);
            List<MessageDeliveryStatus> statuses = messageDeliveryStatusRepository.findByMessageId(m.getId());
            if (!statuses.isEmpty()) {
                messageDeliveryStatusRepository.deleteAll(statuses);
            }
        }
        if (!messages.isEmpty()) {
            messageRepository.deleteAll(messages);
        }
    }

    /**
     * Remove a user from a group. For admin hard-delete, their own messages are
     * also removed. For self-delete, messages stay and point at the tombstone.
     */
    private void purgeUserFromGroup(GroupConversation g, Long userId, boolean deleteOwnMessages) {
        if (deleteOwnMessages) {
            deleteOwnMessages(g.getId(), userId);
        }

        if (g.getParticipants() != null) {
            g.getParticipants().removeIf(u -> userId.equals(u.getId()));
        }
        if (g.getAdmins() != null) {
            g.getAdmins().removeIf(u -> userId.equals(u.getId()));
        }

        boolean noParticipants = g.getParticipants() == null || g.getParticipants().isEmpty();
        if (noParticipants) {
            ossService.deleteObjectByUrl(g.getGroupIcon());
            purgeConversationMessages(g.getId());
            groupConversationRepository.delete(g);
        } else {
            if (g.getAdmins() == null) {
                g.setAdmins(new ArrayList<>());
            }
            if (g.getAdmins().isEmpty()) {
                g.getAdmins().add(g.getParticipants().get(0));
            }
            groupConversationRepository.save(g);
        }
    }

    /** Delete only the given user's own messages in a conversation (media + statuses). */
    private void deleteOwnMessages(Long conversationId, Long userId) {
        List<Message> own = messageRepository.findByConversationId(conversationId).stream()
                .filter(m -> m.getSender() != null && userId.equals(m.getSender().getId()))
                .toList();
        for (Message m : own) {
            deleteMessageMedia(m);
            List<MessageDeliveryStatus> statuses = messageDeliveryStatusRepository.findByMessageId(m.getId());
            if (!statuses.isEmpty()) {
                messageDeliveryStatusRepository.deleteAll(statuses);
            }
        }
        if (!own.isEmpty()) {
            messageRepository.deleteAll(own);
        }
    }

    /** Best-effort delete of a message's OSS media (image URL, or "url|duration" for voice). */
    private void deleteMessageMedia(Message m) {
        String content = m.getContent();
        if (content == null || content.isBlank()) {
            return;
        }
        String type = m.getType();
        if ("image".equalsIgnoreCase(type)) {
            ossService.deleteObjectByUrl(content);
        } else if ("voice".equalsIgnoreCase(type)) {
            int sep = content.indexOf('|');
            ossService.deleteObjectByUrl(sep >= 0 ? content.substring(0, sep) : content);
        }
    }

    private void anonymizeUser(User user) {
        user.setFirstName(DELETED_FIRST_NAME);
        user.setLastName(DELETED_LAST_NAME);
        user.setEmail(uniqueDeletedEmail(user.getId()));
        user.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
        user.setProfileImage(null);
        user.setVerifiedUser(false);
        user.setAdmin(false);
        user.setInstructor(false);
        user.setActive(false);
        user.setPoints(0);
        user.setBirthday(null);
        user.setBio(null);
        user.setLocation(null);
        user.setPhone(null);
        user.setDeletedAccount(true);
        user.setDeletedAt(Instant.now());
        userRepository.save(user);
    }

    private String uniqueDeletedEmail(Long userId) {
        for (int i = 0; i < 5; i++) {
            String candidate = sha256Hex(userId + ":" + UUID.randomUUID()).substring(0, 40) + "@deleted.account";
            if (userRepository.findByEmail(candidate).isEmpty()) {
                return candidate;
            }
        }
        return userId + "-" + UUID.randomUUID().toString().replace("-", "") + "@deleted.account";
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                out.append(String.format("%02x", b));
            }
            return out.toString();
        } catch (NoSuchAlgorithmException e) {
            return UUID.randomUUID().toString().replace("-", "");
        }
    }

    private void putIfNonZero(Map<String, Long> references, String key, long count) {
        if (count > 0) {
            references.put(key, count);
        }
    }

    public static class DeletedAccountStillReferencedException extends RuntimeException {
        private final Map<String, Long> references;

        public DeletedAccountStillReferencedException(Map<String, Long> references) {
            super("Deleted Account still has retained content references.");
            this.references = references;
        }

        public Map<String, Long> getReferences() {
            return references;
        }
    }
}
