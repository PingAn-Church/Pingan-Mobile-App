package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

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
import com.fyp.backend.repository.UserBlockRepository;
import com.fyp.backend.repository.UserModuleProgressRepository;
import com.fyp.backend.repository.UserPreferencesRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.repository.UserVideoProgressRepository;

/**
 * Behaviour tests for irreversible account deletion. Pure unit tests — every
 * repository and OSS are mocked, so no DB/OSS calls happen. The guards (only an
 * inactive, non-admin account may be wiped) and the foreign-key sweeps that let
 * the {@code users} row be deleted are the safety-critical invariants here.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class UserAccountDeletionServiceTest {

    @Mock private UserRepository userRepository;
    @Mock private OSSService ossService;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private MessageRepository messageRepository;
    @Mock private MessageDeliveryStatusRepository messageDeliveryStatusRepository;
    @Mock private PushTokenRepository pushTokenRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private ThreadRepository threadRepository;
    @Mock private ThreadReplyRepository threadReplyRepository;
    @Mock private EventRepository eventRepository;
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

    @Test
    void deletesInactiveNonAdminUserAndAllAssociatedData() {
        when(userRepository.findById(ID)).thenReturn(Optional.of(user(false, false)));

        service.deleteUserCompletely(ID);

        // The user row itself is removed.
        verify(userRepository).deleteById(ID);
        // Foreign-key sweeps that unblock the row delete.
        verify(messageRepository).deleteReadReceiptsByUserId(ID);
        verify(messageDeliveryStatusRepository).deleteByUserId(ID);
        verify(pushTokenRepository).deleteByUserId(ID);
        verify(refreshTokenRepository).deleteByUserEmail(EMAIL);
        verify(threadReplyRepository).deleteByAuthorId(ID);
        // A representative slice of the e-learning cleanup.
        verify(quizAttemptRepository).deleteByUserId(ID);
        verify(courseEnrollmentRepository).deleteByUserId(ID);
        verify(userPreferencesRepository).deleteByUserId(ID);
        // The avatar is removed from OSS.
        verify(ossService).deleteObjectByUrl(AVATAR);
    }

    @Test
    void refusesToDeleteAnActiveAccount() {
        when(userRepository.findById(ID)).thenReturn(Optional.of(user(true, false)));

        assertThrows(RuntimeException.class, () -> service.deleteUserCompletely(ID));

        verify(userRepository, never()).deleteById(anyLong());
        verify(ossService, never()).deleteObjectByUrl(anyString());
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
}
