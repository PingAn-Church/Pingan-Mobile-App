package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
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

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.PrivateConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;

/**
 * Opening a conversation marks all of it read, for participants only.
 *
 * Reading is a single watermark move whatever the size of the history — the old
 * version wrote a row per message per member, which is thousands of writes to
 * clear one badge in a large group. Private chats additionally flip their
 * receipts so the sender's tick becomes Seen; groups have no receipts to flip.
 */
@ExtendWith(MockitoExtension.class)
class MarkConversationReadTest {

    @Mock private MessageRepository messageRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private MessageDeliveryStatusRepository deliveryStatusRepository;
    @Mock private ConversationReadStateService conversationReadStateService;

    @InjectMocks private ChatService chatService;

    private User user(long id) {
        User user = new User();
        user.setId(id);
        user.setEmail("user" + id + "@example.com");
        return user;
    }

    private GroupConversation group(Long id, User... participants) {
        GroupConversation conversation = new GroupConversation();
        conversation.setId(id);
        conversation.setGroupName("Prayer");
        conversation.setParticipants(List.of(participants));
        return conversation;
    }

    private PrivateConversation privateChat(Long id, User a, User b) {
        PrivateConversation conversation = new PrivateConversation();
        conversation.setId(id);
        conversation.setUserOne(a);
        conversation.setUserTwo(b);
        return conversation;
    }

    @Test
    void readingAGroupMovesTheWatermarkAndWritesNoReceipts() {
        when(groupConversationRepository.findById(42L))
                .thenReturn(Optional.of(group(42L, user(1L), user(2L))));
        when(messageRepository.countUnread(42L, 1L)).thenReturn(0L);

        assertEquals(0, chatService.markConversationRead(1L, 42L, "group"));

        verify(conversationReadStateService).markRead(42L, 1L);
        // The whole point: no per-message writes, however big the group or its history.
        verifyNoInteractions(deliveryStatusRepository);
    }

    @Test
    void readingAPrivateChatAlsoFlipsTheReceiptsBehindTheSeenTick() {
        when(privateConversationRepository.findById(7L))
                .thenReturn(Optional.of(privateChat(7L, user(1L), user(2L))));
        when(messageRepository.countUnread(7L, 1L)).thenReturn(0L);

        assertEquals(0, chatService.markConversationRead(1L, 7L, "private"));

        verify(conversationReadStateService).markRead(7L, 1L);
        verify(deliveryStatusRepository).markConversationRead(7L, 1L);
    }

    @Test
    void reportsAnythingThatArrivedMidFlight() {
        when(groupConversationRepository.findById(42L))
                .thenReturn(Optional.of(group(42L, user(1L), user(2L))));
        when(messageRepository.countUnread(42L, 1L)).thenReturn(1L);

        assertEquals(1, chatService.markConversationRead(1L, 42L, "group"));
    }

    @Test
    void refusesToMarkAConversationTheUserIsNotIn() {
        when(groupConversationRepository.findById(42L))
                .thenReturn(Optional.of(group(42L, user(2L), user(3L))));

        assertThrows(IllegalArgumentException.class,
                () -> chatService.markConversationRead(1L, 42L, "group"));

        verifyNoInteractions(deliveryStatusRepository);
        verify(conversationReadStateService, never()).markRead(anyLong(), anyLong());
    }

    @Test
    void rejectsAnUnknownConversationType() {
        assertThrows(IllegalArgumentException.class,
                () -> chatService.markConversationRead(1L, 42L, "learning"));

        verifyNoInteractions(deliveryStatusRepository);
        verifyNoInteractions(conversationReadStateService);
    }
}
