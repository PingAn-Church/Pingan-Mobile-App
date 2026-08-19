package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Group-admin promotion guards: admin implies member (an outsider would gain
 * authority over a group they cannot read, and the roster fan-out would never
 * reach them), and the target must be chat-eligible like every other path that
 * grants conversation standing.
 */
@ExtendWith(MockitoExtension.class)
class AddAdminToGroupTest {

    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private UserRepository userRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private OSSService ossService;
    @Mock private MessageRepository messageRepository;
    @Mock private MessageDeliveryStatusRepository messageDeliveryStatusRepository;
    @Mock private ConversationMuteRepository conversationMuteRepository;
    @Mock private OssCleanupService ossCleanupService;

    @InjectMocks private ConversationService conversationService;

    private User user(long id, boolean verified) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        user.setVerifiedUser(verified);
        user.setActive(true);
        user.setDeletedAccount(false);
        return user;
    }

    private GroupConversation group(User admin, List<User> participants) {
        GroupConversation group = new GroupConversation();
        group.setId(42L);
        group.setGroupName("Group");
        group.setParticipants(new ArrayList<>(participants));
        group.setAdmins(new ArrayList<>(List.of(admin)));
        return group;
    }

    private void stubUser(User user) {
        lenient().when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
    }

    @Test
    void nonParticipantCannotBecomeAdmin() {
        User admin = user(1L, true);
        User outsider = user(2L, true);
        stubUser(admin);
        stubUser(outsider);
        GroupConversation group = group(admin, List.of(admin));
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(group));

        assertThrows(IllegalArgumentException.class,
                () -> conversationService.addAdminToGroup(42L, 2L, 1L));
        assertTrue(group.getAdmins().stream().noneMatch(u -> u.getId().equals(2L)));
        verify(groupConversationRepository, never()).save(any(GroupConversation.class));
    }

    @Test
    void unverifiedParticipantCannotBecomeAdmin() {
        User admin = user(1L, true);
        User unverified = user(2L, false);
        stubUser(admin);
        stubUser(unverified);
        GroupConversation group = group(admin, List.of(admin, unverified));
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(group));

        assertThrows(AccessDeniedException.class,
                () -> conversationService.addAdminToGroup(42L, 2L, 1L));
        verify(groupConversationRepository, never()).save(any(GroupConversation.class));
    }

    @Test
    void verifiedParticipantIsPromoted() {
        User admin = user(1L, true);
        User member = user(2L, true);
        stubUser(admin);
        stubUser(member);
        GroupConversation group = group(admin, List.of(admin, member));
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(group));

        // The happy path registers an after-commit notification, which needs an
        // active synchronization (same pattern as ChatPushNotificationTest).
        TransactionSynchronizationManager.initSynchronization();
        try {
            assertNotNull(conversationService.addAdminToGroup(42L, 2L, 1L));
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }

        assertTrue(group.getAdmins().stream().anyMatch(u -> u.getId().equals(2L)));
        verify(groupConversationRepository).save(group);
    }
}
