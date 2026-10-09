package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
import com.fyp.backend.dto.ReplyPreviewDto;
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
 * Replying quotes another message in the same conversation. The quote is
 * computed for whoever reads it, and the person replied to hears about it the
 * way a mentioned person does.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ReplyMessageTest {

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

    private final User alice = user(1L, "Alice");
    private final User bob = user(2L, "Bob");
    private final User carol = user(3L, "Carol");
    private GroupConversation group;
    private Message bobsMessage;

    @BeforeEach
    void setUp() {
        group = new GroupConversation();
        group.setId(42L);
        group.setGroupName("Test Group");
        group.setParticipants(List.of(alice, bob, carol));
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(group));
        when(userRepository.findById(1L)).thenReturn(Optional.of(alice));
        when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));

        bobsMessage = stored(5L, bob, group, "hello there");
        when(messageRepository.findById(5L)).thenReturn(Optional.of(bobsMessage));
        when(messageRepository.findById(404L)).thenReturn(Optional.empty());

        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    void aReplyQuotesAMessageFromTheSameConversation() {
        MessageDto dto = outgoing("nice to see you");
        dto.setReplyToMessageId(5L);

        MessageDto sent = chatService.sendMessageAndBroadcast(dto, "group");

        ArgumentCaptor<Message> saved = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository).save(saved.capture());
        assertSame(bobsMessage, saved.getValue().getReplyTo());
        assertEquals(5L, sent.getReplyToMessageId());
        assertEquals("hello there", sent.getReplyTo().getContent());
        assertEquals(2L, sent.getReplyTo().getSenderId());
        assertEquals("text", sent.getReplyTo().getType());
        assertFalse(sent.getReplyTo().isHidden());
    }

    @Test
    void aReplyToAnotherConversationIsRefused() {
        GroupConversation elsewhere = new GroupConversation();
        elsewhere.setId(99L);
        Message foreign = stored(7L, bob, elsewhere, "private matters");
        when(messageRepository.findById(7L)).thenReturn(Optional.of(foreign));
        MessageDto dto = outgoing("quoting you");
        dto.setReplyToMessageId(7L);

        assertThrows(IllegalArgumentException.class, () -> chatService.sendMessageAndBroadcast(dto, "group"));
        verify(messageRepository, never()).save(any());
    }

    @Test
    void aReplyToAMissingMessageIsRefused() {
        MessageDto dto = outgoing("quoting nothing");
        dto.setReplyToMessageId(404L);

        assertThrows(IllegalArgumentException.class, () -> chatService.sendMessageAndBroadcast(dto, "group"));
        verify(messageRepository, never()).save(any());
    }

    @Test
    void theQuotedAuthorIsPushedAsIfMentionedWithReplyWording() {
        MessageDto dto = outgoing("nice to see you");
        dto.setReplyToMessageId(5L);

        chatService.sendMessageAndBroadcast(dto, "group");
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }

        ArgumentCaptor<LocalizedText> mentionedBody = ArgumentCaptor.forClass(LocalizedText.class);
        // Carol gets the ordinary push; Bob, who is being answered, gets the named one.
        verify(fanoutPublisher).publishChat(any(MessageDto.class), eq(List.of(3L)), eq(List.of(2L)),
                any(LocalizedText.class), any(LocalizedText.class), mentionedBody.capture());
        assertEquals("↩️ Alice 1 replied to you", mentionedBody.getValue().render("en"));
        // Family name first for a Chinese reader; Latin names keep their space.
        assertEquals("↩️ 1 Alice 回复了你", mentionedBody.getValue().render("zh"));
    }

    @Test
    void replyingToYourselfPushesNobodyByName() {
        Message alicesOwn = stored(6L, alice, group, "my earlier thought");
        when(messageRepository.findById(6L)).thenReturn(Optional.of(alicesOwn));
        MessageDto dto = outgoing("to add to that");
        dto.setReplyToMessageId(6L);

        chatService.sendMessageAndBroadcast(dto, "group");
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }

        verify(fanoutPublisher).publishChat(any(MessageDto.class), eq(List.of(2L, 3L)), eq(List.of()),
                any(LocalizedText.class), any(LocalizedText.class), any(LocalizedText.class));
    }

    @Test
    void aReportedOriginalIsHiddenInTheQuoteFromEveryoneButItsAuthorAndAdmins() {
        bobsMessage.setReported(true);
        Message reply = stored(9L, alice, group, "about that");
        reply.setReplyTo(bobsMessage);
        User admin = user(10L, "Admin");
        admin.setAdmin(true);

        ReplyPreviewDto forCarol = new MessageDto(reply, carol).getReplyTo();
        ReplyPreviewDto forBob = new MessageDto(reply, bob).getReplyTo();
        ReplyPreviewDto forAdmin = new MessageDto(reply, admin).getReplyTo();
        ReplyPreviewDto forBroadcast = new MessageDto(reply).getReplyTo();

        assertTrue(forCarol.isHidden());
        assertNull(forCarol.getContent());
        assertEquals("hello there", forBob.getContent());
        assertEquals("hello there", forAdmin.getContent());
        // A broadcast reaches everyone, so it gets the cautious answer.
        assertTrue(forBroadcast.isHidden());
        // The quote's identity survives either way: the client still knows whose message it was.
        assertEquals(2L, forCarol.getSenderId());
    }

    @Test
    void theExcerptIsCappedSoAQuoteStaysAPointer() {
        String longText = "x".repeat(400);
        assertEquals(160, ReplyPreviewDto.excerpt(longText).length());
        assertTrue(ReplyPreviewDto.excerpt(longText).endsWith("…"));
        assertEquals("short", ReplyPreviewDto.excerpt("  short  "));
        // A quote draws no styling, so the markers are not quoted either.
        assertEquals("Sunday is cancelled", ReplyPreviewDto.excerpt("*Sunday* is _cancelled_"));
        assertNull(ReplyPreviewDto.excerpt(null));
    }

    @Test
    void theAssistantsAnswerQuotesTheQuestion() {
        User assistant = user(50L, "ShalomBot");
        assistant.setBot(true);
        group.setParticipants(List.of(alice, bob, carol, assistant));
        when(messageRepository.existsByRespondsToMessageId(5L)).thenReturn(false);
        when(messageRepository.saveAndFlush(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));
        // sanitiseMentions keeps only mentions of real participants.
        when(groupConversationRepository.isParticipant(42L, 2L)).thenReturn(true);

        MessageDto answer = chatService.sendAssistantReply(42L, 5L, 2L, assistant, "Grace and peace.");

        assertEquals(5L, answer.getReplyToMessageId());
        assertEquals("hello there", answer.getReplyTo().getContent());
        // The @ stays: it is what carries the push to the asker.
        assertEquals(List.of(2L), answer.getMentionedUserIds());
    }

    private MessageDto outgoing(String content) {
        MessageDto dto = new MessageDto();
        dto.setConversationId(42L);
        dto.setSenderId(1L);
        dto.setType("text");
        dto.setConversationType("group");
        dto.setContent(content);
        return dto;
    }

    private static Message stored(Long id, User sender, GroupConversation conversation, String content) {
        Message message = new Message();
        message.setId(id);
        message.setSender(sender);
        message.setConversation(conversation);
        message.setConversationType("group");
        message.setType("text");
        message.setContent(content);
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        return message;
    }

    private static User user(long id, String firstName) {
        User user = new User();
        user.setId(id);
        user.setFirstName(firstName);
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        return user;
    }
}
