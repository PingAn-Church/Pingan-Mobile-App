package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.model.User;
import com.fyp.backend.repository.UserRepository;

/**
 * The new-member badge is one integer per admin, and every interesting case is
 * about what happens at its edges: an admin who has never looked, an admin who
 * was promoted today, and the upgrade where nobody has a marker at all. Getting
 * any of those wrong shows up as a badge counting the entire membership, or as
 * one that never appears — both of which read as the feature being broken.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AdminAlertServiceTest {

    @Mock private UserRepository userRepository;

    @InjectMocks private AdminAlertService adminAlertService;

    @Captor private ArgumentCaptor<List<User>> savedAdmins;

    private static User admin(Long id, Long lastSeenMemberId) {
        User u = new User();
        u.setId(id);
        u.setAdmin(true);
        u.setActive(true);
        u.setLastSeenMemberId(lastSeenMemberId);
        return u;
    }

    private static User member(Long id) {
        User u = new User();
        u.setId(id);
        u.setAdmin(false);
        u.setActive(true);
        return u;
    }

    @Test
    void anAdminWhoHasNeverLookedIsNotHandedTheWholeMembership() {
        when(userRepository.findById(1L)).thenReturn(Optional.of(admin(1L, null)));

        assertEquals(0, adminAlertService.unseenNewMemberCount(1L));
        // Crucially it must not stamp a marker here either: this is read from the
        // push path, where a silent write would swallow the very sign-up being
        // announced. Markers come from the backfill and from promotion.
        verify(userRepository, never()).save(any(User.class));
        verify(userRepository, never()).countByIdGreaterThanAndDeletedAccountFalseAndBotFalse(anyLong());
    }

    @Test
    void countsOnlyTheAccountsNewerThanTheMarker() {
        when(userRepository.findById(1L)).thenReturn(Optional.of(admin(1L, 40L)));
        when(userRepository.countByIdGreaterThanAndDeletedAccountFalseAndBotFalse(40L)).thenReturn(3L);

        assertEquals(3, adminAlertService.unseenNewMemberCount(1L));
    }

    @Test
    void nonAdminsHaveNoBadgeEvenIfTheySomehowCarryAMarker() {
        User demoted = member(9L);
        demoted.setLastSeenMemberId(10L);
        when(userRepository.findById(9L)).thenReturn(Optional.of(demoted));

        assertEquals(0, adminAlertService.unseenNewMemberCount(9L));
        verify(userRepository, never()).countByIdGreaterThanAndDeletedAccountFalseAndBotFalse(anyLong());
    }

    @Test
    void anUnknownOrAnonymousCallerHasNoBadge() {
        when(userRepository.findById(404L)).thenReturn(Optional.empty());

        assertEquals(0, adminAlertService.unseenNewMemberCount(404L));
        assertEquals(0, adminAlertService.unseenNewMemberCount(null));
    }

    @Test
    void openingTheUserListMovesTheMarkerToTheNewestAccount() {
        User a = admin(1L, 40L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(a));
        when(userRepository.findHighestUserId()).thenReturn(57L);

        adminAlertService.markNewMembersSeen(1L);

        assertEquals(57L, a.getLastSeenMemberId());
        verify(userRepository).save(a);
    }

    @Test
    void markingSeenIsIgnoredForNonAdmins() {
        when(userRepository.findById(9L)).thenReturn(Optional.of(member(9L)));

        adminAlertService.markNewMembersSeen(9L);

        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void backfillStartsEveryUnmarkedAdminFromTodaysMembership() {
        User first = admin(1L, null);
        User second = admin(2L, null);
        when(userRepository.findByIsAdminTrueAndLastSeenMemberIdIsNull())
                .thenReturn(List.of(first, second));
        when(userRepository.findHighestUserId()).thenReturn(57L);

        adminAlertService.backfillUnmarkedAdmins();

        verify(userRepository).saveAll(savedAdmins.capture());
        assertEquals(2, savedAdmins.getValue().size());
        assertEquals(57L, first.getLastSeenMemberId());
        assertEquals(57L, second.getLastSeenMemberId());
    }

    @Test
    void backfillLeavesAdminsWhoAreAlreadyTrackingAlone() {
        when(userRepository.findByIsAdminTrueAndLastSeenMemberIdIsNull()).thenReturn(List.of());

        adminAlertService.backfillUnmarkedAdmins();

        verify(userRepository, never()).saveAll(any());
        verify(userRepository, never()).findHighestUserId();
    }

    @Test
    void promotionStampsTheNewAdminSoTheyDoNotWaitForTheNextRestart() {
        User promoted = admin(5L, null);
        when(userRepository.findHighestUserId()).thenReturn(57L);

        adminAlertService.startTrackingNewMembers(promoted);

        assertEquals(57L, promoted.getLastSeenMemberId());
    }

    @Test
    void promotionNeverRewindsAnEstablishedMarker() {
        // Re-granting admin to someone who already had it must not silently mark
        // everyone they had not got to yet as read.
        User existing = admin(5L, 40L);

        adminAlertService.startTrackingNewMembers(existing);

        assertEquals(40L, existing.getLastSeenMemberId());
        verify(userRepository, never()).findHighestUserId();
    }

    @Test
    void promotionIgnoresAccountsThatAreNotAdmins() {
        User notAdmin = member(9L);

        adminAlertService.startTrackingNewMembers(notAdmin);
        adminAlertService.startTrackingNewMembers(null);

        assertNull(notAdmin.getLastSeenMemberId());
        verify(userRepository, never()).findHighestUserId();
    }
}
