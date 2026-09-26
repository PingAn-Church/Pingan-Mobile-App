package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.model.GroupConversation;
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
 * Behaviour tests for irreversible account deletion. Pure unit tests — every
 * repository and OSS are mocked, so no DB/OSS calls happen. Both the admin
 * hard-delete and the user self-delete run the same complete sweep: the guards
 * and the foreign-key sweeps that let the {@code users} row be deleted are the
 * safety-critical invariants here.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserAccountDeletionServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private OssCleanupService ossCleanupService;
    @Mock private RedisService redisService;
    @Mock private ReviewService reviewService;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private MessageRepository messageRepository;
    @Mock private MessageDeliveryStatusRepository messageDeliveryStatusRepository;
    @Mock private ConversationReadStateRepository conversationReadStateRepository;
    @Mock private PushTokenRepository pushTokenRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private ThreadRepository threadRepository;
    @Mock private ThreadReplyRepository threadReplyRepository;
    @Mock private ThreadSubscriptionRepository threadSubscriptionRepository;
    @Mock private ThreadContentCleanupService threadContentCleanupService;
    @Mock private MessageReportRepository messageReportRepository;
    @Mock private EventRepository eventRepository;
    @Mock private EventRegistrationRepository eventRegistrationRepository;
    @Mock private MessageReactionRepository messageReactionRepository;
    @Mock private FormApplicationRepository formApplicationRepository;
    @Mock private CourseRepository courseRepository;
    @Mock private QuizAttemptRepository quizAttemptRepository;
    @Mock private CourseEnrollmentRepository courseEnrollmentRepository;
    @Mock private CourseWishlistRepository courseWishlistRepository;
    @Mock private CertificateRepository certificateRepository;
    @Mock private LearningGoalRepository learningGoalRepository;
    @Mock private UserAnalyticsRepository userAnalyticsRepository;
    @Mock private UserModuleProgressRepository userModuleProgressRepository;
    @Mock private UserVideoProgressRepository userVideoProgressRepository;
    @Mock private ResourceProgressRepository resourceProgressRepository;
    @Mock private UserAchievementRepository userAchievementRepository;
    @Mock private CourseRatingRepository courseRatingRepository;
    @Mock private UserPreferencesRepository userPreferencesRepository;
    @Mock private SpiritualGiftResultRepository spiritualGiftResultRepository;
    @Mock private UserBlockRepository userBlockRepository;

    @InjectMocks private UserAccountDeletionService service;

    private static final Long ID = 42L;
    private static final String EMAIL = "gone@example.com";
    private static final String AVATAR = "https://x.oss/userProfilePictures/a.jpg";

    private User user(boolean active, boolean admin) {
        User u = new User();
        u.setId(ID);
        u.setEmail(EMAIL);
        u.setActive(active);
        u.setAdmin(admin);
        u.setProfileImage(AVATAR);
        return u;
    }

    private User member(long id) {
        User u = new User();
        u.setId(id);
        return u;
    }

    private GroupConversation group(long groupId, List<User> participants, List<User> admins) {
        GroupConversation g = new GroupConversation();
        g.setId(groupId);
        g.setGroupName("Group " + groupId);
        g.setParticipants(participants);
        g.setAdmins(admins);
        return g;
    }

    @BeforeEach
    void setUpLists() {
        when(courseEnrollmentRepository.findByUserId(ID)).thenReturn(List.of());
        when(courseRatingRepository.findByUserId(ID)).thenReturn(List.of());
        when(certificateRepository.findByUserId(ID)).thenReturn(List.of());
        when(privateConversationRepository.findByUserId(ID)).thenReturn(List.of());
        when(groupConversationRepository.findByParticipantId(ID)).thenReturn(List.of());
        when(groupConversationRepository.findByAdminId(ID)).thenReturn(List.of());
        when(threadRepository.findByCreatedById(ID)).thenReturn(List.of());
        when(threadReplyRepository.findByAuthorId(ID)).thenReturn(List.of());
        when(eventRepository.findByCheckedInUserId(ID)).thenReturn(List.of());
        when(messageReportRepository.findBySenderIdOrReporterIdOrResolvedById(ID, ID, ID))
                .thenReturn(List.of());
    }

    @Test
    void deletesInactiveNonAdminUserAndAllAssociatedData() {
        when(userRepository.findById(ID)).thenReturn(Optional.of(user(false, false)));

        service.deleteUserCompletely(ID);

        // The user row itself is removed.
        verify(userRepository).deleteById(ID);
        // Foreign-key sweeps that unblock the row delete.
        verify(messageDeliveryStatusRepository).deleteByUserId(ID);
        verify(conversationReadStateRepository).deleteByUserId(ID);
        verify(pushTokenRepository).deleteByUserId(ID);
        verify(refreshTokenRepository).deleteByUserEmail(EMAIL);
        verify(redisService).clearUserOnlineStatus(EMAIL);
        verify(threadReplyRepository).findByAuthorId(ID);
        verify(threadSubscriptionRepository).deleteByUserId(ID);
        verify(messageRepository).deleteMentionReferencesByUserId(ID);
        // A representative slice of the e-learning cleanup.
        verify(quizAttemptRepository).deleteByUserId(ID);
        verify(courseEnrollmentRepository).deleteByUserId(ID);
        verify(userPreferencesRepository).deleteByUserId(ID);
        verify(spiritualGiftResultRepository).deleteByUserId(ID);
        // The avatar is removed from OSS.
        verify(ossCleanupService).deleteAfterCommit(any(java.util.Collection.class));
    }

    @Test
    void selfDeleteRemovesTheUserRowAndAllData() {
        // An active, non-admin user deleting themselves is now a complete hard delete
        // (no more anonymized "Deleted Account" tombstone).
        when(userRepository.findById(ID)).thenReturn(Optional.of(user(true, false)));

        service.deleteOwnAccount(ID);

        // The user row is deleted, not anonymized/saved.
        verify(userRepository).deleteById(ID);
        verify(userRepository, never()).save(any(User.class));
        // Shared UGC is now removed too (previously kept under the tombstone).
        verify(threadReplyRepository).findByAuthorId(ID);
        verify(threadSubscriptionRepository).deleteByUserId(ID);
        verify(conversationReadStateRepository).deleteByUserId(ID);
        // Private data / auth / avatar swept.
        verify(pushTokenRepository).deleteByUserId(ID);
        verify(refreshTokenRepository).deleteByUserEmail(EMAIL);
        verify(redisService).clearUserOnlineStatus(EMAIL);
        verify(ossCleanupService).deleteAfterCommit(any(java.util.Collection.class));
    }

    @Test
    void forumDeletionUsesLifecycleCleanupAndRemovesScalarReferences() {
        User target = user(false, false);
        Thread ownedThread = Thread.builder().id(70L).createdBy(target).build();
        ThreadReply externalReply = ThreadReply.builder().id(80L).author(target).build();
        when(userRepository.findById(ID)).thenReturn(Optional.of(target));
        when(threadRepository.findByCreatedById(ID)).thenReturn(List.of(ownedThread));
        when(threadReplyRepository.findByAuthorId(ID)).thenReturn(List.of(externalReply));

        service.deleteUserCompletely(ID);

        verify(threadContentCleanupService).deleteThreadById(70L);
        verify(threadContentCleanupService).deleteReply(externalReply);
        verify(threadSubscriptionRepository).deleteByUserId(ID);
        verify(messageRepository).deleteMentionReferencesByUserId(ID);
    }

    @Test
    void selfDeleteRefusesForAdmin() {
        when(userRepository.findById(ID)).thenReturn(Optional.of(user(true, true)));

        assertThrows(RuntimeException.class, () -> service.deleteOwnAccount(ID));

        verify(userRepository, never()).deleteById(anyLong());
        verify(ossCleanupService, never()).deleteAfterCommit(any(java.util.Collection.class));
    }

    @Test
    void refusesToDeleteAnActiveAccount() {
        when(userRepository.findById(ID)).thenReturn(Optional.of(user(true, false)));

        assertThrows(RuntimeException.class, () -> service.deleteUserCompletely(ID));

        verify(userRepository, never()).deleteById(anyLong());
        verify(ossCleanupService, never()).deleteAfterCommit(any(java.util.Collection.class));
    }

    @Test
    void refusesToDeleteAnAdminAccount() {
        // Admin but already inactive — still must not be hard-deleted.
        when(userRepository.findById(ID)).thenReturn(Optional.of(user(false, true)));

        assertThrows(RuntimeException.class, () -> service.deleteUserCompletely(ID));

        verify(userRepository, never()).deleteById(anyLong());
    }

    @Test
    void throwsWhenUserMissing() {
        when(userRepository.findById(ID)).thenReturn(Optional.empty());

        assertThrows(RuntimeException.class, () -> service.deleteUserCompletely(ID));

        verify(userRepository, never()).deleteById(anyLong());
    }

    // ---- group cleanup (regression: LazyInitializationException on participants) --

    @Test
    void deletingUserInAGroupWithOtherMembersRemovesThemAndKeepsGroup() {
        User target = user(false, false);
        User other = member(99L);
        List<User> participants = new ArrayList<>(List.of(target, other));
        List<User> admins = new ArrayList<>(List.of(target)); // leaving user was the sole admin
        GroupConversation g = group(7L, participants, admins);

        when(userRepository.findById(ID)).thenReturn(Optional.of(target));
        when(groupConversationRepository.findByParticipantId(ID)).thenReturn(List.of(g));
        when(groupConversationRepository.findById(7L)).thenReturn(Optional.of(g));

        service.deleteUserCompletely(ID);

        // Leaving user pulled from participants + admins; the remaining member promoted.
        org.junit.jupiter.api.Assertions.assertFalse(
                participants.stream().anyMatch(u -> ID.equals(u.getId())));
        org.junit.jupiter.api.Assertions.assertTrue(admins.contains(other));
        // Group survives — membership change persisted, not deleted; only the leaving
        // user's own messages are removed from a surviving group.
        verify(groupConversationRepository).save(g);
        verify(groupConversationRepository, never()).delete(g);
        verify(messageRepository).deleteByConversationIdAndSenderIdBulk(7L, ID);
        verify(userRepository).deleteById(ID);
    }

    @Test
    void deletingTheLastMemberDeletesTheWholeGroup() {
        User target = user(false, false);
        List<User> participants = new ArrayList<>(List.of(target)); // only member left
        List<User> admins = new ArrayList<>(List.of(target));
        GroupConversation g = group(8L, participants, admins);

        when(userRepository.findById(ID)).thenReturn(Optional.of(target));
        when(groupConversationRepository.findByParticipantId(ID)).thenReturn(List.of(g));
        when(groupConversationRepository.findById(8L)).thenReturn(Optional.of(g));

        service.deleteUserCompletely(ID);

        // Empty group removed entirely, with all of its messages purged.
        verify(groupConversationRepository).delete(g);
        verify(groupConversationRepository, never()).save(g);
        verify(messageRepository).deleteByConversationIdBulk(8L);
        verify(userRepository).deleteById(ID);
    }

    @Test
    void deletingUserInMultipleGroupsProcessesEachViaFreshRefetch() {
        User target = user(false, false);
        GroupConversation g1 = group(7L,
                new ArrayList<>(List.of(target, member(91L))),
                new ArrayList<>(List.of(member(91L))));
        GroupConversation g2 = group(9L,
                new ArrayList<>(List.of(target, member(92L))),
                new ArrayList<>(List.of(member(92L))));

        when(userRepository.findById(ID)).thenReturn(Optional.of(target));
        when(groupConversationRepository.findByParticipantId(ID)).thenReturn(List.of(g1, g2));
        when(groupConversationRepository.findById(7L)).thenReturn(Optional.of(g1));
        when(groupConversationRepository.findById(9L)).thenReturn(Optional.of(g2));

        service.deleteUserCompletely(ID);

        // Each group is re-fetched fresh (not reused from the initial list) and
        // updated — the fix for the multi-group LazyInitializationException, where
        // purging one group's messages detaches the others.
        verify(groupConversationRepository).findById(7L);
        verify(groupConversationRepository).findById(9L);
        verify(groupConversationRepository).save(g1);
        verify(groupConversationRepository).save(g2);
        verify(userRepository).deleteById(ID);
    }
}
