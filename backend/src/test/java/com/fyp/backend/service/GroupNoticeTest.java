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
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.ConversationDto;
import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.ConversationMuteRepository;
import com.fyp.backend.repository.ConversationReadStateRepository;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * One pinned message per group: admins pin and unpin, a "📌" line is posted,
 * every open chat hears about it on the group topic, and the conversation list
 * carries the notice.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class GroupNoticeTest {

    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private ConversationMuteRepository conversationMuteRepository;
    @Mock private MessageRepository messageRepository;
    @Mock private UserRepository userRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private ChatService chatService;
    @Mock private ConversationReadStateRepository conversationReadStateRepository;
    @Mock private AssistantAccountService assistantAccountService;

    @InjectMocks private ConversationService conversationService;

    private final User alice = user(1L);
    private final User bob = user(2L);
    private GroupConversation group;
    private Message bobsMessage;

    @BeforeEach
    void setUp() {
        group = new GroupConversation();
        group.setId(42L);
        group.setGroupName("Youth");
        group.setParticipants(new java.util.ArrayList<>(List.of(alice, bob)));
        group.setAdmins(new java.util.ArrayList<>(List.of(alice)));
        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(group));
        when(groupConversationRepository.save(any(GroupConversation.class))).thenAnswer(inv -> inv.getArgument(0));
        when(groupConversationRepository.countParticipants(42L)).thenReturn(2L);
        when(userRepository.findById(1L)).thenReturn(Optional.of(alice));
        when(userRepository.findById(2L)).thenReturn(Optional.of(bob));

        bobsMessage = stored(5L, bob, group, "Service moves to 10:00 this week");
        when(messageRepository.findById(5L)).thenReturn(Optional.of(bobsMessage));

        MessageDto announcement = new MessageDto();
        announcement.setMessageId(77L);
        when(chatService.postGroupNotice(eq(42L), any(User.class), any(Message.class))).thenReturn(announcement);

        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    void anAdminPinsAMessageWhichPostsANoticeAndTellsTheGroup() {
        ConversationDto dto = conversationService.pinMessage(42L, 5L, 1L);
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }

        verify(chatService).postGroupNotice(eq(42L), eq(alice), eq(bobsMessage));
        assertEquals(5L, group.getPinnedMessageId());
        assertEquals(77L, group.getPinnedNoticeMessageId());
        assertEquals(1L, group.getPinnedById());

        assertEquals(5L, dto.getNotice().getMessageId());
        assertEquals(77L, dto.getNotice().getNoticeMessageId());
        assertEquals("Service moves to 10:00 this week", dto.getNotice().getMessage().getContent());
        assertEquals(2L, dto.getNotice().getMessage().getSenderId());
        assertEquals("User", dto.getNotice().getPinnedByFirstName());

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/conversation-42"), payload.capture());
        Map<?, ?> event = (Map<?, ?>) payload.getValue();
        assertEquals("GROUP_NOTICE", event.get("eventType"));
        assertEquals(42L, event.get("conversationId"));
        assertEquals(dto.getNotice(), event.get("notice"));
    }

    @Test
    void onlyAdminsMayPin() {
        assertThrows(AccessDeniedException.class, () -> conversationService.pinMessage(42L, 5L, 2L));
        verify(chatService, never()).postGroupNotice(any(), any(), any());
        verify(groupConversationRepository, never()).save(any());
    }

    @Test
    void aMessageFromAnotherGroupOrUnderReviewCannotBePinned() {
        GroupConversation elsewhere = new GroupConversation();
        elsewhere.setId(99L);
        when(messageRepository.findById(7L)).thenReturn(Optional.of(stored(7L, bob, elsewhere, "private")));
        assertThrows(IllegalArgumentException.class, () -> conversationService.pinMessage(42L, 7L, 1L));

        bobsMessage.setReported(true);
        assertThrows(IllegalArgumentException.class, () -> conversationService.pinMessage(42L, 5L, 1L));
        verify(chatService, never()).postGroupNotice(any(), any(), any());
    }

    @Test
    void unpinningClearsTheGroupAndTellsEveryoneWithANullNotice() {
        group.setPinnedMessageId(5L);
        group.setPinnedNoticeMessageId(77L);
        group.setPinnedById(1L);
        group.setPinnedAt(new Timestamp(System.currentTimeMillis()));

        ConversationDto dto = conversationService.unpinMessage(42L, 1L);
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }

        assertNull(group.getPinnedMessageId());
        assertNull(group.getPinnedNoticeMessageId());
        assertNull(dto.getNotice());
        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/conversation-42"), payload.capture());
        assertNull(((Map<?, ?>) payload.getValue()).get("notice"));
    }

    @Test
    void readCountIsTakenAgainstTheAnnouncementNotTheOlderPinnedMessage() {
        group.setPinnedMessageId(5L);
        group.setPinnedNoticeMessageId(77L);
        when(groupConversationRepository.countParticipants(42L)).thenReturn(120L);
        when(conversationReadStateRepository.countByConversationIdAndLastReadMessageIdGreaterThanEqual(42L, 77L))
                .thenReturn(45L);

        Map<String, Object> readers = conversationService.noticeReaders(42L, 1L);

        assertEquals(45L, readers.get("read"));
        assertEquals(120L, readers.get("total"));
        assertThrows(AccessDeniedException.class, () -> conversationService.noticeReaders(42L, 2L));
    }

    @Test
    void theConversationListCarriesTheNoticeDrawnForTheViewer() {
        group.setPinnedMessageId(5L);
        group.setPinnedNoticeMessageId(77L);
        group.setPinnedById(1L);
        when(groupConversationRepository.findByParticipantId(2L)).thenReturn(List.of(group));

        List<ConversationDto> list = conversationService.getConversationsByUserId(2L);

        assertEquals(1, list.size());
        assertEquals(5L, list.get(0).getNotice().getMessageId());
        assertEquals("Service moves to 10:00 this week", list.get(0).getNotice().getMessage().getContent());
        assertEquals(1L, list.get(0).getNotice().getPinnedById());
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

    private static User user(long id) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        user.setVerifiedUser(true);
        user.setActive(true);
        return user;
    }
}
