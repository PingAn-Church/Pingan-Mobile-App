package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.CreatePollRequest;
import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.dto.PollDto;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.Poll;
import com.fyp.backend.model.PrivateConversation;
import com.fyp.backend.model.User;
import com.fyp.backend.mq.FanoutPublisher;
import com.fyp.backend.repository.EventRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.UserRepository;

/** Creating a poll posts a "📊 question" message and binds the poll to it. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PollMessageTest {

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

    private final User alice = user(1L);

    @BeforeEach
    void setUp() {
        GroupConversation group = new GroupConversation();
        group.setId(42L);
        group.setGroupName("Youth");
        group.setParticipants(List.of(alice, user(2L)));
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(group));
        when(userRepository.findById(1L)).thenReturn(Optional.of(alice));
        when(messageRepository.save(any(Message.class))).thenAnswer(inv -> {
            Message saved = inv.getArgument(0);
            saved.setId(500L);
            return saved;
        });

        Poll poll = new Poll();
        poll.setId(7L);
        poll.setMode(Poll.SINGLE);
        poll.setQuestion("Tea or coffee?");
        when(pollService.create(eq(42L), eq(1L), any(CreatePollRequest.class))).thenReturn(poll);
        PollDto summary = new PollDto();
        summary.setId(7L);
        summary.setMessageId(500L);
        when(pollService.summaryForMessage(500L, null)).thenReturn(summary);

        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    void creatingAPollPostsItsMessageAndBindsTheTwo() {
        CreatePollRequest request = new CreatePollRequest();
        request.setConversationId(42L);
        request.setQuestion("Tea or coffee?");
        request.setMode("SINGLE");
        request.setOptions(List.of("Tea", "Coffee"));

        MessageDto sent = chatService.createPoll("group", 1L, request);

        ArgumentCaptor<Message> saved = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository).save(saved.capture());
        assertEquals("poll", saved.getValue().getType());
        // Server-written, and what a build without the card shows as text.
        assertEquals("📊 Tea or coffee?", saved.getValue().getContent());
        verify(pollService).attachMessage(7L, 500L);
        assertNotNull(sent.getPoll());
        assertEquals(7L, sent.getPoll().getId());
    }

    @Test
    void aSignUpSheetIsAnnouncedWithItsOwnMark() {
        Poll sheet = new Poll();
        sheet.setId(8L);
        sheet.setMode(Poll.SIGNUP);
        sheet.setQuestion("Potluck on Saturday");
        when(pollService.create(eq(42L), eq(1L), any(CreatePollRequest.class))).thenReturn(sheet);
        CreatePollRequest request = new CreatePollRequest();
        request.setConversationId(42L);
        request.setQuestion("Potluck on Saturday");
        request.setMode("SIGNUP");

        chatService.createPoll("group", 1L, request);

        ArgumentCaptor<Message> saved = ArgumentCaptor.forClass(Message.class);
        verify(messageRepository).save(saved.capture());
        assertEquals("📝 Potluck on Saturday", saved.getValue().getContent());
    }

    @Test
    void pollsAreForGroupsOnly() {
        PrivateConversation pair = new PrivateConversation();
        pair.setId(43L);
        when(privateConversationRepository.findById(43L)).thenReturn(Optional.of(pair));
        CreatePollRequest request = new CreatePollRequest();
        request.setConversationId(43L);
        request.setQuestion("Tea?");
        request.setMode("SINGLE");

        assertThrows(IllegalArgumentException.class, () -> chatService.createPoll("private", 1L, request));
        verify(pollService, never()).create(any(), any(), any());
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
