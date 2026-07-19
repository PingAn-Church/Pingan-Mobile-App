package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fyp.backend.model.ConversationMute;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.PushTokenRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Per-conversation mutes: muted participants are dropped from chat push
 * fan-outs, non-chat pushes ignore mutes entirely, and mute management is
 * participant-gated and idempotent.
 */
@ExtendWith(MockitoExtension.class)
class ConversationMuteTest {

    @Mock private PushTokenRepository pushTokenRepository;
    @Mock private UserRepository userRepository;
    @Mock private ConversationMuteRepository conversationMuteRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;

    @InjectMocks private PushNotificationService pushNotificationService;
    @InjectMocks private ConversationMuteService conversationMuteService;

    private User user(long id) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        return user;
    }

    @Test
    void mutedRecipientsAreSkippedInChatPushes() {
        when(conversationMuteRepository.findByConversationIdAndConversationType(42L, "group"))
                .thenReturn(List.of(new ConversationMute(2L, 42L, "group")));
        when(pushTokenRepository.findByUserId(3L)).thenReturn(List.of());

        pushNotificationService.sendPushNotification(List.of(2L, 3L), "body", "title", 42L, "group");

        verify(pushTokenRepository).findByUserId(3L);
        verify(pushTokenRepository, never()).findByUserId(2L);
    }

    @Test
    void nonChatPushesIgnoreMutes() {
        when(pushTokenRepository.findByUserId(2L)).thenReturn(List.of());

        pushNotificationService.sendPushNotification(List.of(2L), "body", "title", 7L, "learning");

        verify(pushTokenRepository).findByUserId(2L);
        verifyNoInteractions(conversationMuteRepository);
    }

    @Test
    void participantCanMuteAndUnmute() {
        GroupConversation conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setParticipants(List.of(user(1L), user(2L)));
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(conversation));
        when(conversationMuteRepository.findByUserIdAndConversationIdAndConversationType(1L, 42L, "group"))
                .thenReturn(Optional.empty());

        conversationMuteService.setMuted(1L, 42L, "group", true);
        verify(conversationMuteRepository).save(any(ConversationMute.class));

        ConversationMute mute = new ConversationMute(1L, 42L, "group");
        when(conversationMuteRepository.findByUserIdAndConversationIdAndConversationType(1L, 42L, "group"))
                .thenReturn(Optional.of(mute));

        conversationMuteService.setMuted(1L, 42L, "group", false);
        verify(conversationMuteRepository).delete(mute);
    }

    @Test
    void nonParticipantCannotMute() {
        GroupConversation conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setParticipants(List.of(user(1L), user(2L)));
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(conversation));

        assertThrows(IllegalArgumentException.class,
                () -> conversationMuteService.setMuted(9L, 42L, "group", true));
        verify(conversationMuteRepository, never()).save(any());
    }

    @Test
    void isMutedReflectsStoredRow() {
        when(conversationMuteRepository.findByUserIdAndConversationIdAndConversationType(1L, 42L, "group"))
                .thenReturn(Optional.of(new ConversationMute(1L, 42L, "group")));
        assertTrue(conversationMuteService.isMuted(1L, 42L, "group"));

        when(conversationMuteRepository.findByUserIdAndConversationIdAndConversationType(1L, 5L, "private"))
                .thenReturn(Optional.empty());
        assertFalse(conversationMuteService.isMuted(1L, 5L, "private"));
    }
}
