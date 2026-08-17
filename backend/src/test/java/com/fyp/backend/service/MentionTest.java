package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.Set;

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
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageDeliveryStatusRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PrivateConversationRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * A mention is a claim the client makes, not a fact — it arrives as a list of ids
 * in a payload anyone could hand-write. These tests pin the trust boundary: only
 * real participants can be named, only group admins can reach everyone at once,
 * and a mention is pushed separately so that muting the group does not silence it.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MentionTest {

    @Mock private MessageRepository messageRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private UserRepository userRepository;
    @Mock private MessageDeliveryStatusRepository deliveryStatusRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private OssCleanupService ossCleanupService;
    @Mock private FanoutPublisher fanoutPublisher;
    @Mock private UserBlockService userBlockService;
    @Spy private ContentSanitizer contentSanitizer = new ContentSanitizer();
    @Spy private PushMessages pushMessages = PushMessagesFixture.real();

    @InjectMocks private ChatService chatService;

    private static User user(long id) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        return user;
    }

    /** A group of 1 (sender), 2 and 3, with `adminIds` as its admins. */
    private GroupConversation group(Long... adminIds) {
        GroupConversation conversation = new GroupConversation();
        conversation.setId(42L);
        conversation.setGroupName("Test Group");
        conversation.setParticipants(List.of(user(1L), user(2L), user(3L)));
        conversation.setAdmins(List.of(adminIds).stream().map(MentionTest::user).toList());

        when(groupConversationRepository.findById(42L)).thenReturn(Optional.of(conversation));
        when(userRepository.findById(anyLong())).thenAnswer(inv -> Optional.of(user(inv.getArgument(0))));
        when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));
        // Everyone in the group really is in the group unless a test says otherwise.
        when(groupConversationRepository.isParticipant(eq(42L), anyLong())).thenReturn(true);
        return conversation;
    }

    private MessageDto send(MessageDto dto) {
        TransactionSynchronizationManager.initSynchronization();
        try {
            MessageDto sent = chatService.sendMessageAndBroadcast(dto, dto.getConversationType());
            for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
                sync.afterCommit();
            }
            return sent;
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private static MessageDto message(List<Long> mentions, boolean everyone) {
        MessageDto dto = new MessageDto();
        dto.setConversationId(42L);
        dto.setSenderId(1L);
        dto.setType("text");
        dto.setConversationType("group");
        dto.setContent("over to you");
        dto.setMentionedUserIds(mentions);
        dto.setMentionsEveryone(everyone);
        return dto;
    }

    @Test
    void mentionedPeopleGetTheirOwnPushAndAreLeftOutOfTheOrdinaryOne() {
        group();

        send(message(List.of(2L), false));

        verify(fanoutPublisher).publishChat(
                any(MessageDto.class), eq(List.of(3L)), eq(List.of(2L)),
                any(), any(), any());
    }

    @Test
    void namingSomebodyWhoIsNotInTheGroupIsDropped() {
        group();
        // 99 is a stranger; the payload can say anything, the server checks.
        when(groupConversationRepository.isParticipant(42L, 99L)).thenReturn(false);

        MessageDto sent = send(message(List.of(2L, 99L), false));

        assertEquals(List.of(2L), sent.getMentionedUserIds());
        verify(fanoutPublisher).publishChat(
                any(MessageDto.class), eq(List.of(3L)), eq(List.of(2L)),
                any(), any(), any());
    }

    @Test
    void mentioningYourselfIsDropped() {
        group();

        MessageDto sent = send(message(List.of(1L, 2L), false));

        assertEquals(List.of(2L), sent.getMentionedUserIds());
    }

    @Test
    void everyoneIsRefusedToSomeoneWhoIsNotAGroupAdmin() {
        group(3L); // sender (1) is not an admin

        MessageDto sent = send(message(List.of(), true));

        assertFalse(sent.isMentionsEveryone());
        verify(fanoutPublisher).publishChat(
                any(MessageDto.class), eq(List.of(2L, 3L)), eq(List.of()),
                any(), any(), any());
    }

    @Test
    void everyoneFromAnAdminReachesTheWholeGroupExceptTheSender() {
        group(1L);

        MessageDto sent = send(message(List.of(), true));

        assertTrue(sent.isMentionsEveryone());
        // Expanded at send time, not stored as a row per member — the app-level
        // group would otherwise write one mention row per person per message.
        assertTrue(sent.getMentionedUserIds().isEmpty());
        verify(fanoutPublisher).publishChat(
                any(MessageDto.class), eq(List.of()), eq(List.of(2L, 3L)),
                any(), any(), any());
    }

    @Test
    void mentionsAreMeaninglessInAPrivateChatAndAreStripped() {
        // A one-to-one chat has exactly one listener; "@" there would only ever
        // duplicate the notification they were already getting.
        Message message = new Message();
        message.setMentionedUserIds(Set.of(2L));
        message.setMentionsEveryone(true);

        MessageDto dto = new MessageDto();
        dto.setConversationId(7L);
        dto.setSenderId(1L);
        dto.setType("text");
        dto.setConversationType("private");
        dto.setContent("hi");
        dto.setMentionedUserIds(List.of(2L));
        dto.setMentionsEveryone(true);

        com.fyp.backend.model.PrivateConversation conversation = new com.fyp.backend.model.PrivateConversation();
        conversation.setId(7L);
        conversation.setUserOne(user(1L));
        conversation.setUserTwo(user(2L));
        when(privateConversationRepository.findById(7L)).thenReturn(Optional.of(conversation));
        when(userRepository.findById(anyLong())).thenAnswer(inv -> Optional.of(user(inv.getArgument(0))));
        when(messageRepository.save(any(Message.class))).thenAnswer(inv -> inv.getArgument(0));
        when(userBlockService.isMessagingBlocked(anyLong(), anyLong())).thenReturn(false);

        MessageDto sent = send(dto);

        assertTrue(sent.getMentionedUserIds().isEmpty());
        assertFalse(sent.isMentionsEveryone());
        verify(fanoutPublisher).publishChat(
                any(MessageDto.class), eq(List.of(2L)), eq(List.of()),
                any(), any(), any());
    }

    @Test
    void theMentionPushNamesWhoCalledYouInTheReadersLanguage() {
        PushMessages real = PushMessagesFixture.real();
        LocalizedText senderName = real.personName("伟", "张");

        assertEquals("📣 伟 张 mentioned you",
                real.get("en", "push.chat.mentionedYou", senderName.render("en")));
        assertEquals("📣 张伟 提到了你",
                real.get("zh", "push.chat.mentionedYou", senderName.render("zh")));
    }

    @Test
    void theOrdinaryPushIsStillSentWhenNobodyIsMentioned() {
        group();

        send(message(List.of(), false));

        ArgumentCaptor<List<Long>> plain = ArgumentCaptor.forClass(List.class);
        verify(fanoutPublisher).publishChat(
                any(MessageDto.class), plain.capture(), eq(List.of()),
                any(), any(), any());
        assertEquals(List.of(2L, 3L), plain.getValue());
    }
}
