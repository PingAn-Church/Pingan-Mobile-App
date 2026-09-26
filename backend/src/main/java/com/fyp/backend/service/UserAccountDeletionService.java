package com.fyp.backend.service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.logging.Logger;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.Certificate;
import com.fyp.backend.model.CourseEnrollment;
import com.fyp.backend.model.CourseRating;
import com.fyp.backend.model.Event;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.MessageReport;
import com.fyp.backend.model.PrivateConversation;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CertificateRepository;
import com.fyp.backend.repository.ConversationReadStateRepository;
import com.fyp.backend.repository.CourseEnrollmentRepository;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.CourseRepository;
import com.fyp.backend.repository.CourseWishlistRepository;
import com.fyp.backend.repository.EventRegistrationRepository;
import com.fyp.backend.repository.EventRepository;
import com.fyp.backend.repository.MessageReactionRepository;
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
import com.fyp.backend.repository.SpiritualGiftResultRepository;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.ThreadSubscriptionRepository;
import com.fyp.backend.repository.UserAchievementRepository;
import com.fyp.backend.repository.UserAnalyticsRepository;
import com.fyp.backend.repository.UserBlockRepository;
import com.fyp.backend.repository.UserModuleProgressRepository;
import com.fyp.backend.repository.UserPreferencesRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.repository.UserVideoProgressRepository;

/**
 * Account deletion. Both the self-delete ({@code DELETE /api/users/me}) and the
 * admin hard-delete ({@code DELETE /api/users/{id}}) run the same irreversible
 * {@link #hardDeleteUser} sweep: every user-generated item and the {@code users}
 * row itself are removed, along with the related OSS objects (avatar, chat media,
 * certificate files). Authored courses are detached and moderation reports are
 * anonymized. Shared Chat/Thread content is intentionally deleted as part of the
 * account-erasure product policy, including dependent replies/conversation history.
 */
@Service
public class UserAccountDeletionService {

    private static final Logger LOGGER = Logger.getLogger(UserAccountDeletionService.class.getName());
    private static final String DELETED_DISPLAY_NAME = "Deleted Account";
    private static final int MEDIA_URL_PAGE_SIZE = 500;

    @Autowired private UserRepository userRepository;
    @Autowired private OssCleanupService ossCleanupService;
    @Autowired private RedisService redisService;
    @Autowired private ReviewService reviewService;

    // Chat
    @Autowired private PrivateConversationRepository privateConversationRepository;
    @Autowired private GroupConversationRepository groupConversationRepository;
    @Autowired private MessageRepository messageRepository;
    @Autowired private MessageDeliveryStatusRepository messageDeliveryStatusRepository;
    @Autowired private ConversationReadStateRepository conversationReadStateRepository;

    // Auth / devices
    @Autowired private PushTokenRepository pushTokenRepository;
    @Autowired private RefreshTokenRepository refreshTokenRepository;

    // Blocking and reports
    @Autowired private UserBlockRepository userBlockRepository;
    @Autowired private MessageReportRepository messageReportRepository;

    // Forum
    @Autowired private ThreadRepository threadRepository;
    @Autowired private ThreadReplyRepository threadReplyRepository;
    @Autowired private ThreadSubscriptionRepository threadSubscriptionRepository;
    @Autowired private ThreadContentCleanupService threadContentCleanupService;

    // Events / forms
    @Autowired private MessageReactionRepository messageReactionRepository;
    @Autowired private EventRepository eventRepository;
    @Autowired private EventRegistrationRepository eventRegistrationRepository;
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
    @Autowired private SpiritualGiftResultRepository spiritualGiftResultRepository;

    /**
     * Admin-triggered permanent deletion. Only a deactivated, non-admin account may
     * be removed this way (downgrade/deactivate first).
     *
     * @throws RuntimeException if the user is missing, still active, or an admin.
     */
    @Transactional
    public void deleteUserCompletely(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.isBot()) {
            throw new RuntimeException("Cannot delete the in-app assistant account.");
        }
        if (user.isAdmin()) {
            throw new RuntimeException("Cannot delete an admin account. Downgrade it first.");
        }
        if (user.isActive()) {
            throw new RuntimeException("Only deactivated (inactive) users can be permanently deleted.");
        }

        hardDeleteUser(user);
        LOGGER.info("Permanently deleted user " + userId + " and all associated data.");
    }

    /**
     * User-requested permanent deletion. Removes the account and everything the user
     * generated, including shared Chat/Thread history; an admin must downgrade first
     * (an admin cannot delete themselves while still an admin).
     *
     * @throws RuntimeException if the user is missing or is an admin.
     */
    @Transactional
    public void deleteOwnAccount(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        if (user.isAdmin()) {
            throw new RuntimeException("Admin accounts must be downgraded before they can be deleted.");
        }

        hardDeleteUser(user);
        LOGGER.info("Permanently deleted own account " + userId + " and all associated data.");
    }

    /**
     * Irreversibly remove a user and every row/object that references them: their
     * conversations and messages (with media), forum threads/replies, device and
     * auth tokens, blocks, applications, event check-ins, learning records, avatar,
     * and finally the {@code users} row. Reports are anonymized and authored courses
     * are detached; shared Chat/Thread content is deliberately not retained.
     */
    private void hardDeleteUser(User user) {
        Long userId = user.getId();
        String email = user.getEmail();
        String profileImage = user.getProfileImage();
        Set<Long> affectedCourseIds = collectLearningCourseIds(userId);
        List<String> accountAssetUrls = new ArrayList<>();
        accountAssetUrls.add(profileImage);
        collectCertificateAssets(userId, affectedCourseIds, accountAssetUrls);

        for (PrivateConversation pc : privateConversationRepository.findByUserId(userId)) {
            purgeConversationMessages(pc.getId());
            privateConversationRepository.delete(pc);
        }

        // Collect the affected group ids up front (both queries run before any
        // context-clearing delete), then process each by RE-FETCHING it fresh.
        // Purging one group's messages clears the persistence context and detaches
        // every other GroupConversation still held from these result lists, so those
        // managed instances must not be reused across iterations — re-fetch per group
        // so each is attached when its lazy participants/admins are read.
        Set<Long> affectedGroupIds = new LinkedHashSet<>();
        for (GroupConversation g : groupConversationRepository.findByParticipantId(userId)) {
            affectedGroupIds.add(g.getId());
        }
        for (GroupConversation g : groupConversationRepository.findByAdminId(userId)) {
            affectedGroupIds.add(g.getId());
        }
        for (Long groupId : affectedGroupIds) {
            groupConversationRepository.findById(groupId)
                    .ifPresent(g -> purgeUserFromGroup(g, userId, true));
        }

        messageDeliveryStatusRepository.deleteByUserId(userId);
        conversationReadStateRepository.deleteByUserId(userId);
        messageRepository.deleteMentionReferencesByUserId(userId);
        messageReactionRepository.deleteByUserId(userId);

        // Delete authored topics first because that also removes their replies.
        // Then query again for this user's replies on topics owned by other users.
        List<Long> authoredThreadIds = threadRepository.findByCreatedById(userId).stream()
                .map(Thread::getId)
                .toList();
        for (Long threadId : authoredThreadIds) {
            threadContentCleanupService.deleteThreadById(threadId);
        }
        for (ThreadReply reply : threadReplyRepository.findByAuthorId(userId)) {
            threadContentCleanupService.deleteReply(reply);
        }
        threadSubscriptionRepository.deleteByUserId(userId);

        pushTokenRepository.deleteByUserId(userId);
        refreshTokenRepository.deleteByUserEmail(email);
        redisService.clearUserOnlineStatus(email);
        userBlockRepository.deleteByBlockerIdOrBlockedId(userId, userId);
        formApplicationRepository.deleteByContactIgnoreCase(email);
        scrubEventCheckins(userId);
        eventRegistrationRepository.deleteByUserId(userId);
        anonymizeReports(userId);
        detachAuthoredCourses(userId);
        deleteLearningRows(userId);

        userRepository.deleteById(userId);
        recomputeAffectedCourses(affectedCourseIds);
        deleteObjectsAfterCommit(accountAssetUrls);
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

    private void collectCertificateAssets(Long userId, Set<Long> affectedCourseIds, List<String> assetUrls) {
        for (Certificate c : certificateRepository.findByUserId(userId)) {
            if (c.getCourseId() != null) {
                affectedCourseIds.add(c.getCourseId());
            }
            assetUrls.add(c.getCredentialUrl());
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
        spiritualGiftResultRepository.deleteByUserId(userId);
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
        courseRepository.detachInstructor(userId, DELETED_DISPLAY_NAME);
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

    /** Delete every message in a conversation (media + delivery statuses + read state). */
    private void purgeConversationMessages(Long conversationId) {
        List<String> objectUrls = collectConversationMediaUrls(conversationId, null);
        messageDeliveryStatusRepository.deleteByConversationId(conversationId);
        conversationReadStateRepository.deleteByConversationId(conversationId);
        messageRepository.deleteByConversationIdBulk(conversationId);
        deleteObjectsAfterCommit(objectUrls);
    }

    /**
     * Remove a user from a group. Their own messages are always deleted (accounts
     * are now removed completely); if the group ends up empty it is deleted too,
     * otherwise an admin is promoted so the group keeps a manager.
     *
     * <p><b>Order matters.</b> The group's lazy {@code participants}/{@code admins}
     * ({@code @ManyToMany}) are read and updated <em>first</em>, while {@code g} is
     * still attached to the persistence context. The message deletes below are
     * {@code @Modifying(clearAutomatically = true)}: they clear the context and
     * detach {@code g}, after which touching an <em>uninitialised</em> lazy
     * collection throws {@code LazyInitializationException} ("could not initialize
     * proxy - no Session") — the failure that broke deletion for anyone in a group.
     * Reading the collections here initialises them, and the membership change is
     * flushed before the context is cleared.
     */
    private void purgeUserFromGroup(GroupConversation g, Long userId, boolean deleteOwnMessages) {
        List<User> participants = g.getParticipants();
        if (participants != null) {
            participants.removeIf(u -> userId.equals(u.getId()));
        }
        List<User> admins = g.getAdmins();
        if (admins != null) {
            admins.removeIf(u -> userId.equals(u.getId()));
        }

        if (participants == null || participants.isEmpty()) {
            // Last member gone — remove the whole group: icon, every message, the row.
            List<String> groupIcon = new ArrayList<>();
            addObjectUrl(groupIcon, g.getGroupIcon());
            deleteObjectsAfterCommit(groupIcon);
            purgeConversationMessages(g.getId());
            groupConversationRepository.delete(g);
            return;
        }

        // Someone remains: keep a manager, then persist the membership change now,
        // while `g` is still attached (flushed before the message delete clears the
        // context; `g` is not touched again afterwards).
        if (admins == null) {
            admins = new ArrayList<>();
            g.setAdmins(admins);
        }
        if (admins.isEmpty()) {
            admins.add(participants.get(0));
        }
        groupConversationRepository.save(g);

        if (deleteOwnMessages) {
            deleteOwnMessages(g.getId(), userId);
        }
    }

    /** Delete only the given user's own messages in a conversation (media + statuses). */
    private void deleteOwnMessages(Long conversationId, Long userId) {
        List<String> objectUrls = collectConversationMediaUrls(conversationId, userId);
        messageDeliveryStatusRepository.deleteByConversationIdAndSenderId(conversationId, userId);
        messageRepository.deleteByConversationIdAndSenderIdBulk(conversationId, userId);
        deleteObjectsAfterCommit(objectUrls);
    }

    private List<String> collectConversationMediaUrls(Long conversationId, Long senderId) {
        List<String> urls = new ArrayList<>();
        int page = 0;
        List<String> batch;
        do {
            PageRequest pageable = PageRequest.of(page++, MEDIA_URL_PAGE_SIZE);
            batch = senderId == null
                    ? messageRepository.findMediaContentsByConversationId(conversationId, pageable)
                    : messageRepository.findMediaContentsByConversationIdAndSenderId(conversationId, senderId, pageable);
            for (String content : batch) {
                addMessageMediaUrl(urls, content);
            }
        } while (batch.size() == MEDIA_URL_PAGE_SIZE);
        return urls;
    }

    private void addMessageMediaUrl(List<String> urls, String content) {
        if (content == null || content.isBlank()) {
            return;
        }
        int sep = content.indexOf('|');
        addObjectUrl(urls, sep >= 0 ? content.substring(0, sep) : content);
    }

    private void addObjectUrl(List<String> urls, String url) {
        if (url != null && !url.isBlank()) {
            urls.add(url);
        }
    }

    private void deleteObjectsAfterCommit(List<String> objectUrls) {
        ossCleanupService.deleteAfterCommit(objectUrls);
    }
}
