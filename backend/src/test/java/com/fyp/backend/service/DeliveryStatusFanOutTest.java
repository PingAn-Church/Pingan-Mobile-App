package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageDeliveryStatus;
import com.fyp.backend.model.PrivateConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;

/**
 * A delivery receipt for a group message records nothing and is broadcast to
 * nobody.
 *
 * Clients report delivered/read for every message they draw, and builds released
 * before read state became a watermark always will. Groups keep no receipts, so
 * acting on those reports would mean waking every member of the conversation —
 * several hundred socket writes per message drawn in the church-wide group — to
 * deliver news of something that was never stored. Returning null is the signal
 * WebSocketController uses to drop the frame.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DeliveryStatusFanOutTest {

    @Mock private MessageRepository messageRepository;
    @Mock private MessageDeliveryStatusRepository deliveryStatusRepository;

    @InjectMocks private ChatService chatService;

    private User user(long id) {
        User u = new User();
        u.setId(id);
        u.setEmail("user" + id + "@example.com");
        return u;
    }

    private Message groupMessage() {
        GroupConversation conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setGroupName("Prayer");
        conversation.setParticipants(List.of(user(1L), user(2L), user(3L)));

        Message m = new Message();
        m.setId(500L);
        m.setConversation(conversation);
        m.setSender(user(2L));
        m.setConversationType("group");
        return m;
    }

    private Message privateMessage() {
        PrivateConversation conversation = new PrivateConversation();
        conversation.setId(7L);
        conversation.setUserOne(user(1L));
        conversation.setUserTwo(user(2L));

        Message m = new Message();
        m.setId(501L);
        m.setConversation(conversation);
        m.setSender(user(2L));
        m.setConversationType("private");
        return m;
    }

    @Test
    void aGroupReceiptRecordsNothingAndAsksForNoBroadcast() {
        when(messageRepository.findById(500L)).thenReturn(Optional.of(groupMessage()));

        assertNull(chatService.updateMessageStatusAuthorized(500L, 42L, 1L, "READ"));

        // Not even the lookup runs: there is nothing to find, and this fires for
        // every message every client draws.
        verifyNoInteractions(deliveryStatusRepository);
    }

    @Test
    void aPrivateReceiptIsStillRecordedAndStillBroadcast() {
        Message message = privateMessage();
        MessageDeliveryStatus receipt =
                new MessageDeliveryStatus(message, user(1L), "SENT", new Timestamp(0L));
        when(messageRepository.findById(501L)).thenReturn(Optional.of(message));
        when(deliveryStatusRepository.findByMessageId(501L)).thenReturn(List.of(receipt));

        // A non-null type is what tells the controller to fan the update out.
        assertEquals("private", chatService.updateMessageStatusAuthorized(501L, 7L, 1L, "READ"));
        assertEquals("READ", receipt.getStatus());
        verify(deliveryStatusRepository).save(receipt);
    }

    @Test
    void aPrivateMessageWithNoReceiptRowAsksForNoBroadcastEither() {
        when(messageRepository.findById(501L)).thenReturn(Optional.of(privateMessage()));
        when(deliveryStatusRepository.findByMessageId(501L)).thenReturn(List.of());

        assertNull(chatService.updateMessageStatusAuthorized(501L, 7L, 1L, "READ"));
        verify(deliveryStatusRepository, never()).save(any(MessageDeliveryStatus.class));
    }

    @Test
    void aReceiptFromSomebodyOutsideTheConversationIsStillRefused() {
        when(messageRepository.findById(500L)).thenReturn(Optional.of(groupMessage()));

        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> chatService.updateMessageStatusAuthorized(500L, 42L, 99L, "READ"));
    }

    @Test
    void aReceiptNamingTheWrongConversationIsStillRefused() {
        when(messageRepository.findById(500L)).thenReturn(Optional.of(groupMessage()));

        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class,
                () -> chatService.updateMessageStatusAuthorized(500L, 999L, 1L, "READ"));
    }
}
