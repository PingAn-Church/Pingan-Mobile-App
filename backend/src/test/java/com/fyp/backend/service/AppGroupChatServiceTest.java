package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.dao.DataIntegrityViolationException;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Membership of the app-level group is derived, never chosen, so the interesting
 * cases are all about the derivation staying true: a verified member is in, an
 * un-verified or deactivated one is out, and the startup pass makes both retroactive
 * so the group is not left half-populated after a deploy.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AppGroupChatServiceTest {

    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private UserRepository userRepository;
    @Mock private ConversationReadStateService conversationReadStateService;
    @Mock private AppGroupCreator appGroupCreator;

    @InjectMocks private AppGroupChatService appGroupChatService;

    private static User member(long id, boolean verified, boolean admin) {
        User u = new User();
        u.setId(id);
        u.setVerifiedUser(verified);
        u.setAdmin(admin);
        u.setActive(true);
        return u;
    }

    private static GroupConversation appGroup(List<User> participants, List<User> admins) {
        GroupConversation group = new GroupConversation();
        group.setId(1L);
        group.setAppLevel(true);
        group.setGroupName(AppGroupChatService.DEFAULT_NAME_EN);
        group.setGroupNameZh(AppGroupChatService.DEFAULT_NAME_ZH);
        group.setParticipants(new ArrayList<>(participants));
        group.setAdmins(new ArrayList<>(admins));
        group.setCreatedAt(Timestamp.from(Instant.now()));
        group.setUpdatedAt(Timestamp.from(Instant.now()));
        return group;
    }

    @Test
    void aMissingGroupIsCreatedInAnIndependentTransactionThenReloaded() {
        GroupConversation created = appGroup(List.of(), List.of());
        when(groupConversationRepository.findFirstByAppLevelTrue())
                .thenReturn(Optional.empty(), Optional.of(created));
        when(userRepository.findChatEligibleMembers()).thenReturn(List.of());

        appGroupChatService.ensureAppGroup();

        verify(appGroupCreator).createIfMissing();
    }

    @Test
    void aConcurrentCreateConflictReloadsTheWinningGroup() {
        GroupConversation winner = appGroup(List.of(), List.of());
        when(groupConversationRepository.findFirstByAppLevelTrue())
                .thenReturn(Optional.empty(), Optional.of(winner));
        org.mockito.Mockito.doThrow(new DataIntegrityViolationException("unique index"))
                .when(appGroupCreator).createIfMissing();
        when(userRepository.findChatEligibleMembers()).thenReturn(List.of());

        appGroupChatService.ensureAppGroup();

        verify(userRepository).findChatEligibleMembers();
    }

    @Test
    void startupPullsInEveryVerifiedMemberWhoIsNotAlreadyThere() {
        User existing = member(10L, true, false);
        User newlyVerified = member(11L, true, false);
        GroupConversation group = appGroup(List.of(existing), List.of());

        when(groupConversationRepository.findFirstByAppLevelTrue()).thenReturn(Optional.of(group));
        when(userRepository.findChatEligibleMembers()).thenReturn(List.of(existing, newlyVerified));

        appGroupChatService.ensureAppGroup();

        assertEquals(2, group.getParticipants().size());
        assertTrue(group.getParticipants().stream().anyMatch(u -> u.getId() == 11L));
        verify(groupConversationRepository).save(group);
    }

    @Test
    void startupDropsAnyoneWhoIsNoLongerEligible() {
        User stillVerified = member(10L, true, false);
        User revoked = member(12L, false, false);
        GroupConversation group = appGroup(List.of(stillVerified, revoked), List.of());

        when(groupConversationRepository.findFirstByAppLevelTrue()).thenReturn(Optional.of(group));
        when(userRepository.findChatEligibleMembers()).thenReturn(List.of(stillVerified));

        appGroupChatService.ensureAppGroup();

        assertEquals(1, group.getParticipants().size());
        assertEquals(10L, group.getParticipants().get(0).getId());
    }

    @Test
    void groupAdminsFollowAppAdmins() {
        User plainMember = member(10L, true, false);
        User appAdmin = member(11L, true, true);
        GroupConversation group = appGroup(List.of(plainMember, appAdmin), List.of(plainMember));

        when(groupConversationRepository.findFirstByAppLevelTrue()).thenReturn(Optional.of(group));
        when(userRepository.findChatEligibleMembers()).thenReturn(List.of(plainMember, appAdmin));

        appGroupChatService.ensureAppGroup();

        assertEquals(1, group.getAdmins().size());
        assertEquals(11L, group.getAdmins().get(0).getId());
    }

    @Test
    void anAlreadyCorrectGroupIsNotWrittenBackOnEveryBoot() {
        User appAdmin = member(11L, true, true);
        GroupConversation group = appGroup(List.of(appAdmin), List.of(appAdmin));

        when(groupConversationRepository.findFirstByAppLevelTrue()).thenReturn(Optional.of(group));
        when(userRepository.findChatEligibleMembers()).thenReturn(List.of(appAdmin));

        appGroupChatService.ensureAppGroup();

        verify(groupConversationRepository, never()).save(any(GroupConversation.class));
    }

    @Test
    void verifyingSomeonePutsThemInTheGroupImmediately() {
        User justVerified = member(20L, true, false);
        GroupConversation group = appGroup(List.of(), List.of());
        when(groupConversationRepository.findFirstByAppLevelTrue()).thenReturn(Optional.of(group));

        appGroupChatService.syncMembership(justVerified);

        assertEquals(1, group.getParticipants().size());
        verify(groupConversationRepository).save(group);
    }

    @Test
    void revokingVerificationTakesThemBackOut() {
        User revoked = member(20L, false, false);
        GroupConversation group = appGroup(List.of(revoked), List.of());
        when(groupConversationRepository.findFirstByAppLevelTrue()).thenReturn(Optional.of(group));

        appGroupChatService.syncMembership(revoked);

        assertTrue(group.getParticipants().isEmpty());
    }

    @Test
    void aDeactivatedAccountLeavesEvenWhileStillFlaggedVerified() {
        // Deactivation keeps the verified flag, so membership has to check both —
        // otherwise a disabled account would keep receiving the church's traffic.
        User deactivated = member(20L, true, false);
        deactivated.setActive(false);
        GroupConversation group = appGroup(List.of(deactivated), List.of());
        when(groupConversationRepository.findFirstByAppLevelTrue()).thenReturn(Optional.of(group));

        appGroupChatService.syncMembership(deactivated);

        assertTrue(group.getParticipants().isEmpty());
    }

    @Test
    void syncingSomeoneWhoIsAlreadyInTheRightStateWritesNothing() {
        User alreadyIn = member(20L, true, false);
        GroupConversation group = appGroup(List.of(alreadyIn), List.of());
        when(groupConversationRepository.findFirstByAppLevelTrue()).thenReturn(Optional.of(group));

        appGroupChatService.syncMembership(alreadyIn);

        verify(groupConversationRepository, never()).save(any(GroupConversation.class));
    }

    @Test
    void renamingRequiresBothLanguages() {
        GroupConversation group = appGroup(List.of(), List.of());
        when(groupConversationRepository.findFirstByAppLevelTrue()).thenReturn(Optional.of(group));

        assertThrows(IllegalArgumentException.class, () -> appGroupChatService.rename("Only English", "  "));
        assertThrows(IllegalArgumentException.class, () -> appGroupChatService.rename(null, "只有中文"));
        // The half-applied rename must not have landed.
        assertEquals(AppGroupChatService.DEFAULT_NAME_EN, group.getGroupName());
        verify(groupConversationRepository, never()).save(any(GroupConversation.class));
    }

    @Test
    void renamingStoresBothNamesTrimmed() {
        GroupConversation group = appGroup(List.of(), List.of());
        when(groupConversationRepository.findFirstByAppLevelTrue()).thenReturn(Optional.of(group));
        when(groupConversationRepository.save(any(GroupConversation.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        appGroupChatService.rename("  Pingan Church  ", " 平安教会 ");

        assertEquals("Pingan Church", group.getGroupName());
        assertEquals("平安教会", group.getGroupNameZh());
    }

    @Test
    void isAppGroupOnlyMatchesTheRealOne() {
        GroupConversation group = appGroup(List.of(), List.of());
        when(groupConversationRepository.findFirstByAppLevelTrue()).thenReturn(Optional.of(group));

        assertTrue(appGroupChatService.isAppGroup(1L));
        assertEquals(false, appGroupChatService.isAppGroup(2L));
        assertEquals(false, appGroupChatService.isAppGroup(null));
    }
}
