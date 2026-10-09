package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.model.Event;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.User;
import com.fyp.backend.mq.FanoutPublisher;
import com.fyp.backend.repository.EventRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * An event share names an event; the server checks it exists and writes the
 * body itself, so that builds without the card still show a readable line.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class EventShareMessageTest {

    @Mock private MessageRepository messageRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private UserRepository userRepository;
    @Mock private MessageDeliveryStatusRepository deliveryStatusRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private OssCleanupService ossCleanupService;
    @Mock private FanoutPublisher fanoutPublisher;
    @Mock private UserBlockService userBlockService;
    @Mock private AssistantAccountService assistantAccountService;
    @Mock private EventRepository eventRepository;
    @Spy private ContentSanitizer contentSanitizer = new ContentSanitizer();
    @Spy private PushMessages pushMessages = PushMessagesFixture.real();

    @InjectMocks private ChatService chatService;

    private final User sender = user(1L);

    @BeforeEach
    void setUp() {
        GroupConversation conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setGroupName("Test Group");
        conversation.setParticipants(List.of(sender, user(2L)));
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(conversation));
        when(userRepository.findById(1L)).thenReturn(Optional.of(sender));
        when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));

        Event event = new Event("Sunday Service", "desc", "2026-10-04", "10:00 AM", "12:00 PM", "Main Hall");
        event.setId(9L);
        when(eventRepository.findById(9L)).thenReturn(Optional.of(event));
        when(eventRepository.findById(404L)).thenReturn(Optional.empty());

        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    void theServerWritesTheBodyFromTheEvent() {
        MessageDto dto = outgoing("event", "whatever the client typed");
        dto.setSharedEventId(9L);

        MessageDto sent = chatService.sendMessageAndBroadcast(dto, "group");

        assertEquals("event", sent.getType());
        assertEquals(9L, sent.getSharedEventId());
        assertEquals("📅 Sunday Service · 2026-10-04 10:00 AM · Main Hall", sent.getContent());
    }

    @Test
    void theIdMayArriveAsTheBody() {
        MessageDto sent = chatService.sendMessageAndBroadcast(outgoing("event", "9"), "group");

        assertEquals(9L, sent.getSharedEventId());
    }

    @Test
    void aMissingOrUnknownEventIsRefused() {
        assertThrows(IllegalArgumentException.class,
                () -> chatService.sendMessageAndBroadcast(outgoing("event", null), "group"));

        MessageDto unknown = outgoing("event", null);
        unknown.setSharedEventId(404L);
        assertThrows(IllegalArgumentException.class,
                () -> chatService.sendMessageAndBroadcast(unknown, "group"));
        verify(messageRepository, never()).save(any());
    }

    @Test
    void onlyAnEventShareCanPointAtAnEvent() {
        MessageDto text = outgoing("text", "hello");
        text.setSharedEventId(9L);

        MessageDto sent = chatService.sendMessageAndBroadcast(text, "group");

        assertNull(sent.getSharedEventId());
    }

    @Test
    void thePushNamesTheEventInTheReadersLanguage() {
        MessageDto dto = outgoing("event", null);
        dto.setSharedEventId(9L);

        chatService.sendMessageAndBroadcast(dto, "group");
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }

        ArgumentCaptor<LocalizedText> body = ArgumentCaptor.forClass(LocalizedText.class);
        verify(fanoutPublisher).publishChat(any(MessageDto.class), eq(List.of(2L)), eq(List.of()),
                any(LocalizedText.class), body.capture(), any(LocalizedText.class));
        assertEquals("📅 Event: Sunday Service", body.getValue().render("en"));
        assertEquals("📅 活动：Sunday Service", body.getValue().render("zh"));
    }

    @Test
    void anEventShareCannotBeEdited() {
        Message stored = new Message();
        stored.setId(5L);
        stored.setSender(sender);
        stored.setType("event");
        stored.setContent("📅 Sunday Service");
        stored.setTimestamp(new Timestamp(System.currentTimeMillis()));
        when(messageRepository.findById(5L)).thenReturn(Optional.of(stored));

        assertThrows(IllegalArgumentException.class,
                () -> chatService.editMessageAndBroadcast(5L, "📅 Something else", "group", 1L));
    }

    private MessageDto outgoing(String type, String content) {
        MessageDto dto = new MessageDto();
        dto.setConversationId(42L);
        dto.setSenderId(1L);
        dto.setType(type);
        dto.setConversationType("group");
        dto.setContent(content);
        return dto;
    }

    private static User user(long id) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        return user;
    }
}
