package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * The boot-time reconcile holds the invariant in both directions: the assistant
 * flag and the roster cannot disagree — except in the app-level group, whose
 * roster is derived and whose flag is therefore a real switch.
 */
@ExtendWith(MockitoExtension.class)
class AssistantAccountServiceTest {

    private static final long ASSISTANT_ID = 99L;

    @Mock private UserRepository userRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PasswordEncoder passwordEncoder;

    @InjectMocks private AssistantAccountService service;

    private User assistant() {
        User bot = new User();
        bot.setId(ASSISTANT_ID);
        bot.setBot(true);
        bot.setFirstName("ShalomBot");
        bot.setDisplayNameZh("平安小助手");
        bot.setEmail("shalombot@assistant.pingan.invalid");
        return bot;
    }

    private GroupConversation group(long id, boolean enabled, boolean appLevel, User... participants) {
        GroupConversation group = new GroupConversation();
        group.setId(id);
        group.setAssistantEnabled(enabled);
        group.setAppLevel(appLevel);
        group.setParticipants(List.of(participants));
        return group;
    }

    @Test
    void flaggedOnWithoutMembershipIsSwitchedOff() {
        User other = new User();
        other.setId(2L);
        GroupConversation drifted = group(10L, true, false, other);
        when(userRepository.findByEmail("shalombot@assistant.pingan.invalid"))
                .thenReturn(Optional.of(assistant()));
        when(groupConversationRepository.findByAssistantEnabledTrue()).thenReturn(List.of(drifted));
        when(groupConversationRepository.findByParticipantId(ASSISTANT_ID)).thenReturn(List.of());

        service.reconcileAssistantMembership();

        assertFalse(drifted.isAssistantEnabled());
        verify(groupConversationRepository).save(drifted);
    }

    @Test
    void membershipWithoutFlagIsSwitchedOn() {
        GroupConversation drifted = group(11L, false, false, assistant());
        when(userRepository.findByEmail("shalombot@assistant.pingan.invalid"))
                .thenReturn(Optional.of(assistant()));
        when(groupConversationRepository.findByAssistantEnabledTrue()).thenReturn(List.of());
        when(groupConversationRepository.findByParticipantId(ASSISTANT_ID)).thenReturn(List.of(drifted));

        service.reconcileAssistantMembership();

        assertTrue(drifted.isAssistantEnabled());
        verify(groupConversationRepository).save(drifted);
    }

    @Test
    void appLevelGroupKeepsItsSwitchedOffToggle() {
        // The assistant is always on the app-level roster; OFF there is a choice,
        // not drift, and must survive the reconcile.
        GroupConversation appGroup = group(1L, false, true, assistant());
        when(userRepository.findByEmail("shalombot@assistant.pingan.invalid"))
                .thenReturn(Optional.of(assistant()));
        when(groupConversationRepository.findByAssistantEnabledTrue()).thenReturn(List.of());
        when(groupConversationRepository.findByParticipantId(ASSISTANT_ID)).thenReturn(List.of(appGroup));

        service.reconcileAssistantMembership();

        assertFalse(appGroup.isAssistantEnabled());
        verify(groupConversationRepository, never()).save(any());
    }

    @Test
    void consistentGroupsAreLeftAlone() {
        GroupConversation healthy = group(12L, true, false, assistant());
        when(userRepository.findByEmail("shalombot@assistant.pingan.invalid"))
                .thenReturn(Optional.of(assistant()));
        when(groupConversationRepository.findByAssistantEnabledTrue()).thenReturn(List.of(healthy));
        when(groupConversationRepository.findByParticipantId(ASSISTANT_ID)).thenReturn(List.of(healthy));

        service.reconcileAssistantMembership();

        assertTrue(healthy.isAssistantEnabled());
        verify(groupConversationRepository, never()).save(any());
    }
}
