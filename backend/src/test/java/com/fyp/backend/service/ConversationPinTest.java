package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fyp.backend.model.ConversationPin;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ConversationPinRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.PrivateConversationRepository;

/**
 * Pinning a conversation to the top of one's own chat list: participant-gated,
 * idempotent, and read back in one query for the whole list.
 */
@ExtendWith(MockitoExtension.class)
class ConversationPinTest {

    @Mock private ConversationPinRepository conversationPinRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;

    @InjectMocks private ConversationPinService conversationPinService;

    private User user(long id) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        return user;
    }

    private GroupConversation group() {
        GroupConversation conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setParticipants(List.of(user(1L), user(2L)));
        return conversation;
    }

    @Test
    void participantCanPinAndUnpin() {
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(group()));
        when(conversationPinRepository.findByUserIdAndConversationIdAndConversationType(1L, 42L, "group"))
                .thenReturn(Optional.empty());

        conversationPinService.setPinned(1L, 42L, "group", true);
        verify(conversationPinRepository).save(any(ConversationPin.class));

        ConversationPin pin = new ConversationPin(1L, 42L, "group");
        when(conversationPinRepository.findByUserIdAndConversationIdAndConversationType(1L, 42L, "group"))
                .thenReturn(Optional.of(pin));

        conversationPinService.setPinned(1L, 42L, "group", true); // already pinned: nothing more to save
        verify(conversationPinRepository).save(any(ConversationPin.class));

        conversationPinService.setPinned(1L, 42L, "group", false);
        verify(conversationPinRepository).delete(pin);
    }

    @Test
    void nonParticipantCannotPin() {
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(group()));

        assertThrows(IllegalArgumentException.class,
                () -> conversationPinService.setPinned(9L, 42L, "group", true));
        verify(conversationPinRepository, never()).save(any());
    }

    @Test
    void isPinnedReflectsStoredRow() {
        when(conversationPinRepository.findByUserIdAndConversationIdAndConversationType(1L, 42L, "group"))
                .thenReturn(Optional.of(new ConversationPin(1L, 42L, "group")));
        assertTrue(conversationPinService.isPinned(1L, 42L, "group"));

        when(conversationPinRepository.findByUserIdAndConversationIdAndConversationType(1L, 5L, "private"))
                .thenReturn(Optional.empty());
        assertFalse(conversationPinService.isPinned(1L, 5L, "private"));
    }

    @Test
    void theWholeListIsDecoratedFromOneQuery() {
        ConversationPin older = new ConversationPin(1L, 42L, "group");
        older.setCreatedAt(new java.sql.Timestamp(1_000L));
        ConversationPin newer = new ConversationPin(1L, 5L, "private");
        newer.setCreatedAt(new java.sql.Timestamp(2_000L));
        when(conversationPinRepository.findByUserId(1L)).thenReturn(List.of(older, newer));

        Map<Long, Long> pinnedAt = conversationPinService.pinnedAtByConversation(1L);

        assertEquals(Map.of(42L, 1_000L, 5L, 2_000L), pinnedAt);
    }
}
