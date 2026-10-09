package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.dto.ReactionSummaryDto;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageReaction;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.MessageReactionRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.UserRepository;

class MessageReactionServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-01T02:00:00Z");

    private final MessageRepository messageRepository = mock(MessageRepository.class);
    private final MessageReactionRepository reactions = mock(MessageReactionRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
    private final MessageReactionService service =
            new MessageReactionService(messageRepository, reactions, userRepository, messagingTemplate);

    private final User alice = user(1L);
    private final User bob = user(2L);
    private final User outsider = user(9L);
    private Message message;

    @BeforeEach
    void setUp() {
        service.setClock(Clock.fixed(NOW, ZoneOffset.UTC));
        GroupConversation group = new GroupConversation();
        group.setId(42L);
        group.setParticipants(List.of(alice, bob));
        message = new Message();
        message.setId(5L);
        message.setSender(bob);
        message.setConversation(group);
        message.setConversationType("group");
        message.setType("text");
        message.setContent("Amen to that");
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        when(messageRepository.findById(5L)).thenReturn(Optional.of(message));
        when(userRepository.findById(1L)).thenReturn(Optional.of(alice));
        when(userRepository.findById(9L)).thenReturn(Optional.of(outsider));
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    void reactingStoresTheCanonicalEmojiAndAnswersWithMineFilledIn() {
        when(reactions.findByMessageIdAndUserIdAndEmoji(5L, 1L, "❤")).thenReturn(Optional.empty());
        when(reactions.countByMessageIds(anyCollection()))
                .thenReturn(List.<Object[]>of(new Object[] { 5L, "❤", 1L }));
        when(reactions.findMineByMessageIds(eq(1L), anyCollection()))
                .thenReturn(List.<Object[]>of(new Object[] { 5L, "❤" }));

        // Typed with the presentation selector, as most keyboards send it.
        MessageDto result = service.toggle(5L, 1L, "❤️", true);

        ArgumentCaptor<MessageReaction> saved = ArgumentCaptor.forClass(MessageReaction.class);
        verify(reactions).save(saved.capture());
        assertEquals("❤", saved.getValue().getEmoji());
        assertEquals(NOW, saved.getValue().getCreatedAt());
        assertEquals(1, result.getReactions().size());
        assertEquals("❤", result.getReactions().get(0).getEmoji());
        assertEquals(1L, result.getReactions().get(0).getCount());
        assertEquals(Boolean.TRUE, result.getReactions().get(0).getMine());
    }

    @Test
    void theBroadcastCarriesTalliesButNotWhoseTheyAre() {
        when(reactions.findByMessageIdAndUserIdAndEmoji(5L, 1L, "🙏")).thenReturn(Optional.empty());
        when(reactions.countByMessageIds(anyCollection()))
                .thenReturn(List.<Object[]>of(new Object[] { 5L, "🙏", 12L }));
        when(reactions.findMineByMessageIds(eq(1L), anyCollection()))
                .thenReturn(List.<Object[]>of(new Object[] { 5L, "🙏" }));

        service.toggle(5L, 1L, "🙏", true);
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/conversation-42"), payload.capture());
        MessageDto everyone = (MessageDto) payload.getValue();
        assertEquals(5L, everyone.getMessageId());
        assertEquals(12L, everyone.getReactions().get(0).getCount());
        assertNull(everyone.getReactions().get(0).getMine(), "one copy for everyone cannot say 'yours'");
        assertFalse(everyone.isEdited());
        assertFalse(everyone.isDeleted());
    }

    @Test
    void togglingIsIdempotentInBothDirections() {
        MessageReaction existing = new MessageReaction(5L, 1L, "👍", NOW);
        when(reactions.findByMessageIdAndUserIdAndEmoji(5L, 1L, "👍")).thenReturn(Optional.of(existing));

        service.toggle(5L, 1L, "👍", true); // already on: nothing to add
        verify(reactions, never()).save(any());

        service.toggle(5L, 1L, "👍", false); // on → off
        verify(reactions).delete(existing);

        when(reactions.findByMessageIdAndUserIdAndEmoji(5L, 1L, "👍")).thenReturn(Optional.empty());
        service.toggle(5L, 1L, "👍", false); // already off: nothing to remove
        verify(reactions).delete(existing); // still exactly once
    }

    @Test
    void onlyTheFixedSetOfEmojisIsAccepted() {
        assertThrows(IllegalArgumentException.class, () -> service.toggle(5L, 1L, "😂", true));
        assertThrows(IllegalArgumentException.class, () -> service.toggle(5L, 1L, "", true));
        assertThrows(IllegalArgumentException.class, () -> service.toggle(5L, 1L, null, true));
        verify(reactions, never()).save(any());
    }

    @Test
    void outsidersAndReportedMessagesAreRefused() {
        assertThrows(IllegalArgumentException.class, () -> service.toggle(5L, 9L, "🙏", true));

        message.setReported(true);
        assertThrows(IllegalArgumentException.class, () -> service.toggle(5L, 1L, "🙏", true));
        verify(reactions, never()).save(any());
    }

    @Test
    void summariesAggregateAPageInAllowedOrderAndMarkTheViewersOwn() {
        when(reactions.countByMessageIds(List.of(5L, 6L))).thenReturn(List.<Object[]>of(
                new Object[] { 5L, "👍", 3L },
                new Object[] { 5L, "🙏", 40L },
                new Object[] { 6L, "❤", 1L }));
        when(reactions.findMineByMessageIds(eq(1L), eq(List.of(5L, 6L))))
                .thenReturn(List.<Object[]>of(new Object[] { 5L, "👍" }));

        Map<Long, List<ReactionSummaryDto>> summaries = service.summaries(List.of(5L, 6L), 1L);

        List<ReactionSummaryDto> five = summaries.get(5L);
        assertEquals(List.of("🙏", "👍"), five.stream().map(ReactionSummaryDto::getEmoji).toList());
        assertEquals(40L, five.get(0).getCount());
        assertEquals(Boolean.FALSE, five.get(0).getMine());
        assertEquals(Boolean.TRUE, five.get(1).getMine());
        assertEquals(Boolean.FALSE, summaries.get(6L).get(0).getMine());
        assertTrue(service.summaries(List.of(), 1L).isEmpty());
    }

    @Test
    void reactorsAreListedForParticipantsOnly() {
        when(reactions.findUserIds(eq(5L), eq("🙏"), any())).thenReturn(List.of(1L, 2L));
        when(userRepository.findAllById(List.of(1L, 2L))).thenReturn(List.of(alice, bob));

        List<Map<String, Object>> who = service.reactors(5L, "🙏", 1L);

        assertEquals(2, who.size());
        assertEquals(1L, who.get(0).get("id"));
        assertEquals("User", who.get(0).get("firstName"));
        assertThrows(IllegalArgumentException.class, () -> service.reactors(5L, "🙏", 9L));
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
