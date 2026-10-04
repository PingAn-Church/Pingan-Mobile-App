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
 * A sticker names a catalog id; the server checks it and writes the body — the
 * sticker's fallback emoji — so a build without the picture still shows
 * something that reads as a message.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class StickerMessageTest {

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
    @Mock private MessageReactionService reactionService;
    @Mock private PollService pollService;
    @Spy private ContentSanitizer contentSanitizer = new ContentSanitizer();
    @Spy private PushMessages pushMessages = PushMessagesFixture.real();

    @InjectMocks private ChatService chatService;

    private final User sender = user(1L);
    private GroupConversation conversation;

    @BeforeEach
    void setUp() {
        conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setGroupName("Test Group");
        conversation.setParticipants(List.of(sender, user(2L)));
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(conversation));
        when(userRepository.findById(1L)).thenReturn(Optional.of(sender));
        when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    void theServerWritesTheFallbackEmojiAndKeepsTheStickerId() {
        MessageDto dto = outgoing("sticker", "whatever the client put here");
        dto.setStickerId("basic.praying");

        MessageDto sent = chatService.sendMessageAndBroadcast(dto, "group");

        assertEquals("sticker", sent.getType());
        assertEquals("basic.praying", sent.getStickerId());
        // What a build without the picture shows, as a plain text bubble.
        assertEquals("🙏", sent.getContent());
        ArgumentCaptor<Message> saved = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository).save(saved.capture());
        assertEquals("basic.praying", saved.getValue().getStickerId());
    }

    @Test
    void anUnknownOrMissingStickerIsRefused() {
        MessageDto unknown = outgoing("sticker", "🎉");
        unknown.setStickerId("basic.party");
        assertThrows(IllegalArgumentException.class,
                () -> chatService.sendMessageAndBroadcast(unknown, "group"));

        assertThrows(IllegalArgumentException.class,
                () -> chatService.sendMessageAndBroadcast(outgoing("sticker", "🙏"), "group"));
        verify(messageRepository, never()).save(any());
    }

    @Test
    void onlyAStickerMessageCarriesAStickerId() {
        MessageDto text = outgoing("text", "hello");
        text.setStickerId("basic.praying");

        MessageDto sent = chatService.sendMessageAndBroadcast(text, "group");

        assertNull(sent.getStickerId());
        assertEquals("hello", sent.getContent());
    }

    @Test
    void thePushNamesItAStickerInTheReadersLanguage() {
        MessageDto dto = outgoing("sticker", null);
        dto.setStickerId("basic.hug");

        chatService.sendMessageAndBroadcast(dto, "group");
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }

        ArgumentCaptor<LocalizedText> body = ArgumentCaptor.forClass(LocalizedText.class);
        verify(fanoutPublisher).publishChat(any(MessageDto.class), eq(List.of(2L)), eq(List.of()),
                any(LocalizedText.class), body.capture(), any(LocalizedText.class));
        assertEquals("[Sticker] 🤗", body.getValue().render("en"));
        assertEquals("[表情] 🤗", body.getValue().render("zh"));
    }

    @Test
    void aStickerCannotBeEdited() {
        Message stored = stored("basic.praying", "🙏");
        when(messageRepository.findById(5L)).thenReturn(Optional.of(stored));

        assertThrows(IllegalArgumentException.class,
                () -> chatService.editMessageAndBroadcast(5L, "something else", "group", 1L));
    }

    @Test
    void aReportedStickerHidesItsPictureFromEveryoneButItsSenderAndAdmins() {
        Message stored = stored("basic.what", "❓");
        stored.setReported(true);

        assertNull(new MessageDto(stored, user(2L)).getStickerId());
        assertNull(new MessageDto(stored, user(2L)).getContent());
        assertEquals("basic.what", new MessageDto(stored, sender).getStickerId());
    }

    private Message stored(String stickerId, String content) {
        Message message = new Message();
        message.setId(5L);
        message.setSender(sender);
        message.setConversation(conversation);
        message.setConversationType("group");
        message.setType("sticker");
        message.setStickerId(stickerId);
        message.setContent(content);
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        return message;
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
