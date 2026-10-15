package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.config.app.ChatProperties;
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
import com.fyp.backend.service.PushMessages;

/**
 * Taking a message back (WeChat's 撤回): within the window the message turns into
 * a placeholder for everyone and loses everything that made it the message; past
 * the window nothing changes at all.
 */
@ExtendWith(MockitoExtension.class)
class MessageRecallTest {

    @Mock private MessageRepository messageRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private UserRepository userRepository;
    @Mock private MessageDeliveryStatusRepository messageDeliveryStatusRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private OssCleanupService ossCleanupService;
    @Mock private FanoutPublisher fanoutPublisher;
    @Mock private UserBlockService userBlockService;
    @Mock private ContentSanitizer contentSanitizer;
    @Mock private PushMessages pushMessages;
    @Mock private ConversationReadStateService conversationReadStateService;
    @Mock private MessageReactionService reactionService;
    @Mock private PollService pollService;

    private final ChatProperties chatProperties = new ChatProperties();
    private ChatService chatService;
    private Message message;

    @BeforeEach
    void setUp() {
        chatService = new ChatService(messageRepository, groupConversationRepository,
                privateConversationRepository, userRepository, messageDeliveryStatusRepository,
                messagingTemplate, ossCleanupService, fanoutPublisher,
                userBlockService, contentSanitizer, pushMessages,
                conversationReadStateService, mock(AssistantAccountService.class),
                mock(EventRepository.class), reactionService, pollService, chatProperties);

        User sender = new User();
        sender.setId(7L);
        sender.setFirstName("Sender");
        sender.setLastName("User");
        User other = new User();
        other.setId(8L);
        other.setFirstName("Other");
        other.setLastName("User");

        GroupConversation conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setParticipants(List.of(sender, other));

        message = new Message();
        message.setId(9L);
        message.setSender(sender);
        message.setConversation(conversation);
        message.setConversationType("group");
        message.setType("text");
        message.setContent("Meet at *7pm* @Other");
        message.setMentionedUserIds(new HashSet<>(Set.of(8L)));
        message.setMentionsEveryone(true);
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        when(messageRepository.findById(9L)).thenReturn(Optional.of(message));
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void withinTheWindowTheMessageBecomesAPlaceholderForEveryone() {
        when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));

        MessageDto recalled = chatService.recallMessageAndBroadcast(9L);

        // The row stays, as a placeholder: a text body any build can draw, nothing else.
        ArgumentCaptor<Message> saved = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository).save(saved.capture());
        assertNotNull(saved.getValue().getRecalledAt());
        assertEquals(ChatService.RECALLED_BODY, saved.getValue().getContent());
        assertEquals("text", saved.getValue().getType());
        assertTrue(saved.getValue().getMentionedUserIds().isEmpty());
        assertFalse(saved.getValue().getMentionsEveryone());
        verify(reactionService).removeAllFor(9L);
        verify(pollService).removeForMessage(9L);
        // Words carry no file, so storage is left alone.
        verify(ossCleanupService, never()).deleteAfterCommit(anyString());

        // What goes out says "recalled", not "deleted": an old build merges it in
        // place like an edit instead of dropping the line.
        assertTrue(recalled.isRecalled());
        assertFalse(recalled.isDeleted());
        assertEquals(ChatService.RECALLED_BODY, recalled.getContent());

        List<TransactionSynchronization> synchronizations = TransactionSynchronizationManager.getSynchronizations();
        assertEquals(1, synchronizations.size());
        synchronizations.forEach(TransactionSynchronization::afterCommit);
        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/conversation-42"), payload.capture());
        assertTrue(((MessageDto) payload.getValue()).isRecalled());
    }

    @Test
    void aRecalledPhotoLeavesStorageOnceTheChangeCommits() {
        message.setType("image");
        message.setContent("https://cdn.example.com/conversations/42/u7_photo.jpg");
        when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));

        chatService.recallMessageAndBroadcast(9L);

        verify(ossCleanupService).deleteAfterCommit("https://cdn.example.com/conversations/42/u7_photo.jpg");
    }

    @Test
    void pastTheWindowNothingChanges() {
        chatProperties.setRecallWindow(Duration.ofMinutes(2));
        message.setTimestamp(new Timestamp(System.currentTimeMillis() - Duration.ofMinutes(3).toMillis()));

        assertThrows(IllegalStateException.class, () -> chatService.recallMessageAndBroadcast(9L));

        verify(messageRepository, never()).save(any());
        verify(reactionService, never()).removeAllFor(any());
        verify(pollService, never()).removeForMessage(any());
        assertNull(message.getRecalledAt());
        assertTrue(TransactionSynchronizationManager.getSynchronizations().isEmpty());
    }

    @Test
    void recallingTwiceIsHarmless() {
        message.setRecalledAt(new Timestamp(System.currentTimeMillis()));
        message.setContent(ChatService.RECALLED_BODY);

        MessageDto again = chatService.recallMessageAndBroadcast(9L);

        assertTrue(again.isRecalled());
        verify(messageRepository, never()).save(any());
        verify(reactionService, never()).removeAllFor(any());
        assertTrue(TransactionSynchronizationManager.getSynchronizations().isEmpty());
    }
}
