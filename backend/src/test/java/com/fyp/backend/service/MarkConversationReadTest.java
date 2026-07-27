package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;

/**
 * Opening a conversation marks all of it read — for participants only, and in an
 * order that also covers messages sent before the reader joined the group.
 */
@ExtendWith(MockitoExtension.class)
class MarkConversationReadTest {

    @Mock private MessageRepository messageRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private MessageDeliveryStatusRepository deliveryStatusRepository;

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

    @Test
    void backfillsMissingDeliveryRowsBeforeFlippingThemToRead() {
        when(groupConversationRepository.findById(42L))
                .thenReturn(Optional.of(group(42L, user(1L), user(2L))));
        when(messageRepository.countUnread(42L, 1L)).thenReturn(0L);

        assertEquals(0, chatService.markConversationRead(1L, 42L, "group"));

        // Order matters: the UPDATE only touches rows that exist, so anyone added to
        // the group after a message was sent needs their row created first.
        InOrder order = inOrder(deliveryStatusRepository);
        order.verify(deliveryStatusRepository).insertSentStatusesForConversation(42L, 1L);
        order.verify(deliveryStatusRepository).markConversationRead(42L, 1L);
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
    }

    @Test
    void rejectsAnUnknownConversationType() {
        assertThrows(IllegalArgumentException.class,
                () -> chatService.markConversationRead(1L, 42L, "learning"));

        verifyNoInteractions(deliveryStatusRepository);
    }
}
