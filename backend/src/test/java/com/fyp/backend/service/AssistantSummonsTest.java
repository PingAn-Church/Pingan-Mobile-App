package com.fyp.backend.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
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
 * When a group message summons the assistant — and when it must not.
 *
 * The typed-name fallback exists because deployed clients holding a stale copy
 * of the conversation offer no assistant entry in their @ picker: people type
 * the name out by hand and the message arrives with no mention id bound. Those
 * summonses must still be answered, and a refused summons must be visible in
 * the logs rather than vanishing.
 */
@ExtendWith(MockitoExtension.class)
class AssistantSummonsTest {

    private static final long GROUP_ID = 42L;
    private static final long SENDER_ID = 1L;
    private static final long ASSISTANT_ID = 99L;

    @Mock private MessageRepository messageRepository;
    @Mock private GroupConversationRepository groupConversationRepository;
    @Mock private PrivateConversationRepository privateConversationRepository;
    @Mock private UserRepository userRepository;
    @Mock private MessageDeliveryStatusRepository deliveryStatusRepository;
    @Mock private SimpMessagingTemplate messagingTemplate;
    @Mock private OssCleanupService ossCleanupService;
    @Mock private FanoutPublisher fanoutPublisher;
    @Mock private UserBlockService userBlockService;
    @Mock private ConversationReadStateService conversationReadStateService;
    @Mock private AssistantAccountService assistantAccountService;
    @Spy private ContentSanitizer contentSanitizer = new ContentSanitizer();
    @Spy private PushMessages pushMessages = PushMessagesFixture.real();

    @InjectMocks private ChatService chatService;

    private GroupConversation group;

    private User user(long id) {
        User user = new User();
        user.setId(id);
        user.setFirstName("User");
        user.setLastName(String.valueOf(id));
        user.setEmail("user" + id + "@example.com");
        return user;
    }

    private User assistant() {
        User bot = new User();
        bot.setId(ASSISTANT_ID);
        bot.setBot(true);
        bot.setFirstName("ShalomBot");
        bot.setLastName("");
        bot.setDisplayNameZh("平安小助手");
        bot.setEmail("shalombot@assistant.pingan.invalid");
        return bot;
    }

    @BeforeEach
    void openTransaction() {
        group = new GroupConversation();
        group.setId(GROUP_ID);
        group.setGroupName("Trial Group");
        group.setParticipants(List.of(user(SENDER_ID), user(2L), assistant()));
        when(groupConversationRepository.findById(GROUP_ID)).thenReturn(Optional.of(group));
        when(userRepository.findById(SENDER_ID)).thenReturn(Optional.of(user(SENDER_ID)));
        when(messageRepository.save(any(Message.class))).thenAnswer(inv -> {
            Message saved = inv.getArgument(0);
            saved.setId(7L);
            return saved;
        });
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void closeTransaction() {
        TransactionSynchronizationManager.clearSynchronization();
    }

    private void send(String content, List<Long> mentionedUserIds) {
        MessageDto dto = new MessageDto();
        dto.setConversationId(GROUP_ID);
        dto.setSenderId(SENDER_ID);
        dto.setType("text");
        dto.setConversationType("group");
        dto.setContent(content);
        dto.setMentionedUserIds(mentionedUserIds);

        chatService.sendMessageAndBroadcast(dto, "group");
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }
    }

    @Test
    void mentionIdSummonsTheAssistant() {
        group.setAssistantEnabled(true);
        when(assistantAccountService.findAssistant()).thenReturn(Optional.of(assistant()));
        when(groupConversationRepository.isParticipant(GROUP_ID, ASSISTANT_ID)).thenReturn(true);

        send("@ShalomBot what is love?", List.of(ASSISTANT_ID));

        verify(fanoutPublisher).publishAssistantReply(GROUP_ID, 7L, SENDER_ID);
    }

    @Test
    void typedChineseNameSummonsWithoutAnyMentionId() {
        group.setAssistantEnabled(true);
        when(assistantAccountService.findAssistant()).thenReturn(Optional.of(assistant()));
        when(groupConversationRepository.isParticipant(GROUP_ID, ASSISTANT_ID)).thenReturn(true);

        send("@平安小助手 请问主日几点开始?", List.of());

        verify(fanoutPublisher).publishAssistantReply(GROUP_ID, 7L, SENDER_ID);
    }

    @Test
    void typedEnglishNameSummonsCaseInsensitively() {
        group.setAssistantEnabled(true);
        when(assistantAccountService.findAssistant()).thenReturn(Optional.of(assistant()));
        when(groupConversationRepository.isParticipant(GROUP_ID, ASSISTANT_ID)).thenReturn(true);

        send("hey @shalombot are you there", List.of());

        verify(fanoutPublisher).publishAssistantReply(GROUP_ID, 7L, SENDER_ID);
    }

    @Test
    void switchedOffAssistantIsNeverSummoned() {
        group.setAssistantEnabled(false);
        when(assistantAccountService.findAssistant()).thenReturn(Optional.of(assistant()));

        send("@平安小助手 在吗?", List.of(ASSISTANT_ID));

        verify(fanoutPublisher, never()).publishAssistantReply(any(), any(), any());
    }

    @Test
    void enabledWithoutMembershipDoesNotSummon() {
        // The drifted state the boot reconcile switches off: flagged on, but the
        // assistant is not on the participant list, so its mention gets stripped.
        group.setAssistantEnabled(true);
        group.setParticipants(List.of(user(SENDER_ID), user(2L)));
        when(assistantAccountService.findAssistant()).thenReturn(Optional.of(assistant()));
        when(groupConversationRepository.isParticipant(GROUP_ID, ASSISTANT_ID)).thenReturn(false);

        send("@平安小助手 在吗?", List.of(ASSISTANT_ID));

        verify(fanoutPublisher, never()).publishAssistantReply(any(), any(), any());
    }

    @Test
    void ordinaryMessagesNeverTouchTheAssistantAccount() {
        group.setAssistantEnabled(true);

        send("no mentions here at all", List.of());

        verify(assistantAccountService, never()).findAssistant();
        verify(fanoutPublisher, never()).publishAssistantReply(any(), any(), any());
    }

    @Test
    void textNamingSomeoneElseDoesNotSummon() {
        group.setAssistantEnabled(true);
        when(assistantAccountService.findAssistant()).thenReturn(Optional.of(assistant()));
        when(groupConversationRepository.isParticipant(GROUP_ID, 2L)).thenReturn(true);

        send("@User 2 could you check this?", List.of(2L));

        verify(fanoutPublisher, never()).publishAssistantReply(any(), any(), any());
    }
}
