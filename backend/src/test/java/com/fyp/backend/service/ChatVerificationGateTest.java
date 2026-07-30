package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
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

import com.fyp.backend.dto.ConversationDto;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Chat is for admin-verified accounts only. The pickers hide unverified users,
 * but that is presentation — these cover the server-side refusal, which is what
 * a stale client or a hand-made request actually runs into.
 */
@ExtendWith(MockitoExtension.class)
class ChatVerificationGateTest {

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

    private void stubUser(User user) {
        lenient().when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
    }

    private ConversationDto privateWith(long otherId) {
        ConversationDto dto = new ConversationDto();
        dto.setConversationType("private");
        dto.setParticipants(new ArrayList<>(List.of(otherId)));
        return dto;
    }

    private ConversationDto groupWith(Long... participantIds) {
        ConversationDto dto = new ConversationDto();
        dto.setConversationType("group");
        dto.setGroupName("Group");
        dto.setParticipants(new ArrayList<>(List.of(participantIds)));
        return dto;
    }

    @Test
    void privateChatWithAnUnverifiedUserIsRefused() {
        stubUser(user(1L, true));
        stubUser(user(2L, false));

        assertThrows(AccessDeniedException.class,
                () -> conversationService.createPrivateConversation(privateWith(2L), 1L));
        verify(privateConversationRepository, never()).save(any());
    }

    @Test
    void anUnverifiedUserCannotStartAPrivateChat() {
        stubUser(user(1L, false));
        stubUser(user(2L, true));

        assertThrows(AccessDeniedException.class,
                () -> conversationService.createPrivateConversation(privateWith(2L), 1L));
        verify(privateConversationRepository, never()).save(any());
    }

    @Test
    void aDeactivatedUserIsRefusedEvenWhenStillFlaggedVerified() {
        stubUser(user(1L, true));
        User inactive = user(2L, true);
        inactive.setActive(false);
        stubUser(inactive);

        assertThrows(AccessDeniedException.class,
                () -> conversationService.createPrivateConversation(privateWith(2L), 1L));
        verify(privateConversationRepository, never()).save(any());
    }

    @Test
    void oneUnverifiedMemberBlocksTheWholeGroup() {
        stubUser(user(1L, true));
        stubUser(user(2L, true));
        stubUser(user(3L, false));

        assertThrows(AccessDeniedException.class,
                () -> conversationService.createGroupConversation(groupWith(2L, 3L), 1L));
        verify(groupConversationRepository, never()).save(any());
    }

    @Test
    void anUnverifiedUserCannotBeInvitedIntoAnExistingGroup() {
        User admin = user(1L, true);
        GroupConversation group = new GroupConversation();
        group.setId(42L);
        group.setParticipants(new ArrayList<>(List.of(admin)));
        group.setAdmins(new ArrayList<>(List.of(admin)));
        lenient().when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(group));

        stubUser(admin);
        stubUser(user(9L, false));

        assertThrows(AccessDeniedException.class,
                () -> conversationService.addParticipantToGroup(42L, 9L, 1L));
        verify(groupConversationRepository, never()).save(any());
    }

    @Test
    void aMissingUserStillReportsNotFoundRatherThanForbidden() {
        stubUser(user(1L, true));
        when(userRepository.findById(404L)).thenReturn(Optional.empty());

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> conversationService.createPrivateConversation(privateWith(404L), 1L));
        assertEquals("Other participant not found", error.getMessage());
    }
}
