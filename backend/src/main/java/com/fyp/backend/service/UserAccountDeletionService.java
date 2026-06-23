package com.fyp.backend.service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.logging.Logger;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fyp.backend.model.Event;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageDeliveryStatus;
import com.fyp.backend.model.PrivateConversation;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CertificateRepository;
import com.fyp.backend.repository.CourseEnrollmentRepository;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.CourseWishlistRepository;
import com.fyp.backend.repository.EventRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.LearningGoalRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
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
import com.fyp.backend.repository.UserModuleProgressRepository;
import com.fyp.backend.repository.UserPreferencesRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.repository.UserVideoProgressRepository;

/**
 * Hard-deletes a user and every row/asset that references them, in one
 * transaction. This is irreversible and admin-only — the soft-delete
 * (deactivation) path is {@link UserService#updateUserActiveStatus}.
 *
 * <p>Ordering matters: rows holding a foreign key to {@code users} (chat
 * messages, conversation membership, read receipts, delivery statuses, push
 * tokens, forum threads/replies) are cleared first so the final
 * {@code users} row delete cannot violate a constraint. Everything else keyed
 * by a plain {@code userId}/{@code userEmail} column (e-learning progress,
 * quiz attempts, certificates, etc.) is swept for data hygiene. OSS objects
 * (avatar, chat image/voice media, orphaned group icons) are best-effort
 * removed via {@link OSSService} which never throws.
 */
@Service
public class UserAccountDeletionService {

    private static final Logger LOGGER = Logger.getLogger(UserAccountDeletionService.class.getName());

    @Autowired private UserRepository userRepository;
    @Autowired private OSSService ossService;

    // Chat
    @Autowired private PrivateConversationRepository privateConversationRepository;
    @Autowired private GroupConversationRepository groupConversationRepository;
    @Autowired private MessageRepository messageRepository;
    @Autowired private MessageDeliveryStatusRepository messageDeliveryStatusRepository;

    // Auth / devices
    @Autowired private PushTokenRepository pushTokenRepository;
    @Autowired private RefreshTokenRepository refreshTokenRepository;

    // Forum
    @Autowired private ThreadRepository threadRepository;
    @Autowired private ThreadReplyRepository threadReplyRepository;

    // Events
    @Autowired private EventRepository eventRepository;

    // E-learning (all keyed by a plain userId column)
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
     * @throws RuntimeException if the user is missing, still active, or an admin.
     */
    @Transactional
    public void deleteUserCompletely(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Guards: only a deactivated, non-admin account can be hard-deleted. This
        // mirrors the UI (delete only appears in the Inactive list) and stops an
        // admin account — or a live account — being wiped by mistake.
        if (user.isAdmin()) {
            throw new RuntimeException("Cannot delete an admin account. Downgrade it first.");
        }
        if (user.isActive()) {
            throw new RuntimeException("Only deactivated (inactive) users can be permanently deleted.");
        }

        // Capture primitives now; later bulk @Modifying sweeps clear the persistence
        // context and would detach the entity.
        String email = user.getEmail();
        String profileImage = user.getProfileImage();

        // 1) Chat — private conversations are removed entirely (both sides lose them).
        for (PrivateConversation pc : privateConversationRepository.findByUserId(userId)) {
            purgeConversationMessages(pc.getId());
            privateConversationRepository.delete(pc);
        }

        // 1b) Chat — group conversations: drop the user's own messages, then their
        // membership. Empty groups are deleted; otherwise an admin is guaranteed.
        Set<Long> handledGroups = new HashSet<>();
        for (GroupConversation g : groupConversationRepository.findByParticipantId(userId)) {
            purgeUserFromGroup(g, userId);
            handledGroups.add(g.getId());
        }
        // Groups where the user lingers only in the admin list (never a participant).
        for (GroupConversation g : groupConversationRepository.findByAdminId(userId)) {
            if (!handledGroups.add(g.getId())) {
                continue;
            }
            purgeUserFromGroup(g, userId);
        }

        // 1c) Sweep any remaining message FK references — the user's read receipts
        // and delivery statuses on messages still held by other participants.
        messageRepository.deleteReadReceiptsByUserId(userId);
        messageDeliveryStatusRepository.deleteByUserId(userId);

        // 2) Forum content: the user's replies anywhere, then their own threads
        // (which cascade-remove every reply left on them).
        threadReplyRepository.deleteByAuthorId(userId);
        for (Thread t : threadRepository.findByCreatedById(userId)) {
            threadRepository.delete(t);
        }

        // 3) Devices / tokens.
        pushTokenRepository.deleteByUserId(userId);
        refreshTokenRepository.deleteByUserEmail(email);

        // 4) Event check-in lists (element collection of user ids — no FK, but stale).
        for (Event e : eventRepository.findAll()) {
            List<Long> ids = e.getCheckedInUserIds();
            if (ids != null && ids.removeIf(id -> userId.equals(id))) {
                e.setCheckedInUserIds(ids);
                eventRepository.save(e);
            }
        }

        // 5) E-learning progress / activity (keyed by plain userId columns).
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

        // 6) Profile avatar in OSS, then the user row itself.
        ossService.deleteObjectByUrl(profileImage);
        userRepository.deleteById(userId);

        LOGGER.info("Permanently deleted user " + userId + " and all associated data.");
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
        // Deleting the Message entities also removes their read-receipt join rows
        // (Message owns the many-to-many), so no separate cleanup is needed here.
        if (!messages.isEmpty()) {
            messageRepository.deleteAll(messages);
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

    /** Remove a user from a group: delete their messages, strip membership, keep the group consistent. */
    private void purgeUserFromGroup(GroupConversation g, Long userId) {
        deleteOwnMessages(g.getId(), userId);

        if (g.getParticipants() != null) {
            g.getParticipants().removeIf(u -> userId.equals(u.getId()));
        }
        if (g.getAdmins() != null) {
            g.getAdmins().removeIf(u -> userId.equals(u.getId()));
        }

        boolean noParticipants = g.getParticipants() == null || g.getParticipants().isEmpty();
        if (noParticipants) {
            // Last member gone — delete the whole group and its icon/messages.
            ossService.deleteObjectByUrl(g.getGroupIcon());
            purgeConversationMessages(g.getId());
            groupConversationRepository.delete(g);
        } else {
            // Never leave a surviving group without an admin.
            if (g.getAdmins() == null) {
                g.setAdmins(new ArrayList<>());
            }
            if (g.getAdmins().isEmpty()) {
                g.getAdmins().add(g.getParticipants().get(0));
            }
            groupConversationRepository.save(g);
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
}
