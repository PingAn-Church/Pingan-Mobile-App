package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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

import com.fyp.backend.dto.CreatePollRequest;
import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.dto.PollDto;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.Poll;
import com.fyp.backend.model.PollOption;
import com.fyp.backend.model.PollVote;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.PollOptionRepository;
import com.fyp.backend.repository.PollRepository;
import com.fyp.backend.repository.PollVoteRepository;
import com.fyp.backend.repository.UserRepository;

class PollServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-01T02:00:00Z");

    private final PollRepository polls = mock(PollRepository.class);
    private final PollOptionRepository options = mock(PollOptionRepository.class);
    private final PollVoteRepository votes = mock(PollVoteRepository.class);
    private final MessageRepository messageRepository = mock(MessageRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final MessageReactionService reactions = mock(MessageReactionService.class);
    private final SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);
    private final PollService service = new PollService(polls, options, votes, messageRepository,
            userRepository, reactions, new ContentSanitizer(), messagingTemplate);

    private final User alice = user(1L);
    private final User bob = user(2L);
    private final User outsider = user(9L);
    private GroupConversation group;
    private Message message;
    private Poll poll;
    private final PollOption tea = option(11L, 7L, "Tea", 1);
    private final PollOption coffee = option(12L, 7L, "Coffee", 2);

    @BeforeEach
    void setUp() {
        service.setClock(Clock.fixed(NOW, ZoneOffset.UTC));
        group = new GroupConversation();
        group.setId(42L);
        group.setParticipants(List.of(alice, bob));
        group.setAdmins(List.of(alice));

        message = new Message();
        message.setId(9L);
        message.setSender(bob);
        message.setConversation(group);
        message.setConversationType("group");
        message.setType("poll");
        message.setContent("📊 Tea or coffee?");
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        when(messageRepository.findById(9L)).thenReturn(Optional.of(message));

        poll = new Poll();
        poll.setId(7L);
        poll.setMessageId(9L);
        poll.setConversationId(42L);
        poll.setCreatorId(2L);
        poll.setQuestion("Tea or coffee?");
        poll.setMode(Poll.SINGLE);
        poll.setCreatedAt(NOW.minusSeconds(600));
        when(polls.findById(7L)).thenReturn(Optional.of(poll));
        when(polls.findByIdForUpdate(7L)).thenReturn(Optional.of(poll));
        when(polls.findByMessageIdIn(anyCollection())).thenReturn(List.of(poll));
        when(polls.save(any(Poll.class))).thenAnswer(inv -> {
            Poll saved = inv.getArgument(0);
            if (saved.getId() == null) saved.setId(70L);
            return saved;
        });
        when(options.findByPollIdOrderByPositionAscIdAsc(7L)).thenReturn(List.of(tea, coffee));
        when(options.findByPollIdInOrderByPositionAscIdAsc(anyCollection())).thenReturn(List.of(tea, coffee));
        when(options.save(any(PollOption.class))).thenAnswer(inv -> {
            PollOption saved = inv.getArgument(0);
            if (saved.getId() == null) saved.setId(99L);
            return saved;
        });
        when(userRepository.findById(1L)).thenReturn(Optional.of(alice));
        when(userRepository.findById(2L)).thenReturn(Optional.of(bob));
        when(userRepository.findById(9L)).thenReturn(Optional.of(outsider));
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    void aSingleChoiceVoteReplacesThePreviousOneAndRebroadcastsWithoutSayingWhose() {
        when(votes.findByPollIdAndUserId(7L, 1L)).thenReturn(List.of(new PollVote(7L, 11L, 1L, NOW)));
        when(votes.countByOptionForPolls(anyCollection())).thenReturn(List.<Object[]>of(new Object[] { 12L, 1L }));
        when(votes.countVotersForPolls(anyCollection())).thenReturn(List.<Object[]>of(new Object[] { 7L, 1L }));
        when(votes.findMine(eq(1L), anyCollection())).thenReturn(List.<Object[]>of(new Object[] { 7L, 12L }));

        MessageDto mine = service.vote(7L, 1L, List.of(12L));
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }

        verify(votes).delete(any(PollVote.class)); // the tea vote goes
        ArgumentCaptor<PollVote> saved = ArgumentCaptor.forClass(PollVote.class);
        verify(votes).save(saved.capture());
        assertEquals(12L, saved.getValue().getOptionId());

        assertEquals(List.of(12L), mine.getPoll().getMyOptionIds());
        assertEquals(1L, mine.getPoll().getVoterCount());

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/conversation-42"), payload.capture());
        MessageDto everyone = (MessageDto) payload.getValue();
        assertNull(everyone.getPoll().getMyOptionIds(), "one copy for everyone cannot say 'yours'");
        assertEquals(1L, everyone.getPoll().getOptions().get(1).getCount());
        assertNotNull(everyone.getReactions(), "tallies ride along so the client does not drop them");
    }

    @Test
    void aSingleChoicePollTakesOneOptionAndAnUnknownOptionIsRefused() {
        assertThrows(IllegalArgumentException.class, () -> service.vote(7L, 1L, List.of(11L, 12L)));
        assertThrows(IllegalArgumentException.class, () -> service.vote(7L, 1L, List.of(404L)));
        verify(votes, never()).save(any());
    }

    @Test
    void aMultiChoiceVoteSetsExactlyTheChosenOptions() {
        poll.setMode(Poll.MULTI);
        when(votes.findByPollIdAndUserId(7L, 1L)).thenReturn(List.of(new PollVote(7L, 11L, 1L, NOW)));

        service.vote(7L, 1L, List.of(11L, 12L));

        verify(votes, never()).delete(any()); // tea kept
        verify(votes, times(1)).save(any(PollVote.class)); // coffee added

        service.vote(7L, 1L, List.of()); // withdraw everything
        verify(votes, times(1)).delete(any(PollVote.class));
    }

    @Test
    void aClosedOrExpiredPollTakesNoMoreVotes() {
        poll.setDeadline(NOW.minusSeconds(1));
        assertThrows(IllegalArgumentException.class, () -> service.vote(7L, 1L, List.of(11L)));

        poll.setDeadline(null);
        poll.setClosedAt(NOW.minusSeconds(60));
        assertThrows(IllegalArgumentException.class, () -> service.vote(7L, 1L, List.of(11L)));
        verify(votes, never()).save(any());
    }

    @Test
    void outsidersCannotVote() {
        assertThrows(IllegalArgumentException.class, () -> service.vote(7L, 9L, List.of(11L)));
    }

    @Test
    void signingUpAddsANumberedEntryOncePerPersonUpToTheCap() {
        poll.setMode(Poll.SIGNUP);
        poll.setMaxEntries(2);
        when(options.countByPollId(7L)).thenReturn(1L);
        when(options.findByPollIdAndCreatedById(7L, 1L)).thenReturn(Optional.empty());

        service.addEntry(7L, 1L, null, "  I'll bring the salad ");

        ArgumentCaptor<PollOption> entry = ArgumentCaptor.forClass(PollOption.class);
        verify(options).save(entry.capture());
        assertNull(entry.getValue().getText(), "shown under the person's own name");
        assertEquals("I'll bring the salad", entry.getValue().getNote());
        assertEquals(2, entry.getValue().getPosition());
        assertEquals(1L, entry.getValue().getCreatedById());
        verify(votes).save(any(PollVote.class)); // their own vote, so head counts read the same

        // Already on the list.
        when(options.findByPollIdAndCreatedById(7L, 1L)).thenReturn(Optional.of(entry.getValue()));
        assertThrows(IllegalArgumentException.class, () -> service.addEntry(7L, 1L, null, null));

        // Full.
        when(options.findByPollIdAndCreatedById(7L, 2L)).thenReturn(Optional.empty());
        when(options.countByPollId(7L)).thenReturn(2L);
        assertThrows(IllegalArgumentException.class, () -> service.addEntry(7L, 2L, null, null));
    }

    @Test
    void votingOnASignUpSheetAndSigningUpOnAPollAreBothRefused() {
        assertThrows(IllegalArgumentException.class, () -> service.addEntry(7L, 1L, null, null));
        poll.setMode(Poll.SIGNUP);
        assertThrows(IllegalArgumentException.class, () -> service.vote(7L, 1L, List.of(11L)));
    }

    @Test
    void leavingASignUpSheetTakesTheEntryAndItsVoteWithIt() {
        poll.setMode(Poll.SIGNUP);
        PollOption mine = option(55L, 7L, null, 3);
        mine.setCreatedById(1L);
        when(options.findByPollIdAndCreatedById(7L, 1L)).thenReturn(Optional.of(mine));

        service.removeEntry(7L, 1L);

        verify(votes).deleteByOptionId(55L);
        verify(options).deleteById(55L);
    }

    @Test
    void onlyTheCreatorOrAGroupAdminMayClose() {
        User carol = user(3L);
        group.setParticipants(List.of(alice, bob, carol));
        when(userRepository.findById(3L)).thenReturn(Optional.of(carol));

        assertThrows(IllegalArgumentException.class, () -> service.close(7L, 3L)); // plain member
        assertNull(poll.getClosedAt());

        service.close(7L, 1L); // admin
        assertEquals(NOW, poll.getClosedAt());

        poll.setClosedAt(null);
        service.close(7L, 2L); // creator
        assertEquals(NOW, poll.getClosedAt());
    }

    @Test
    void votersAreHiddenOnAnAnonymousPoll() {
        when(options.findById(11L)).thenReturn(Optional.of(tea));
        when(votes.findUserIdsByOptionId(eq(11L), any())).thenReturn(List.of(1L, 2L));
        when(userRepository.findAllById(List.of(1L, 2L))).thenReturn(List.of(alice, bob));

        List<Map<String, Object>> who = service.voters(7L, 11L, 1L);
        assertEquals(2, who.size());
        assertEquals(1L, who.get(0).get("id"));

        poll.setAnonymous(true);
        assertThrows(IllegalArgumentException.class, () -> service.voters(7L, 11L, 1L));
    }

    @Test
    void creationValidatesAndFiltersTheCreatorsWords() {
        CreatePollRequest request = new CreatePollRequest();
        request.setMode("single");
        request.setQuestion("  What the fuck shall we sing?  ");
        request.setOptions(List.of("Hymn 12", " ", "Hymn 40"));

        Poll created = service.create(42L, 2L, request);

        assertEquals("What the *** shall we sing?", created.getQuestion());
        assertEquals(Poll.SINGLE, created.getMode());
        assertEquals(42L, created.getConversationId());
        assertEquals(NOW, created.getCreatedAt());
        verify(options, times(2)).save(any(PollOption.class)); // the blank one is dropped

        request.setOptions(List.of("Only one"));
        assertThrows(IllegalArgumentException.class, () -> service.create(42L, 2L, request));
        request.setOptions(List.of("A", "B"));
        request.setMode("ranked");
        assertThrows(IllegalArgumentException.class, () -> service.create(42L, 2L, request));
        request.setMode("multi");
        request.setDeadline(NOW.minusSeconds(1));
        assertThrows(IllegalArgumentException.class, () -> service.create(42L, 2L, request));
        request.setDeadline(null);
        request.setQuestion("   ");
        assertThrows(IllegalArgumentException.class, () -> service.create(42L, 2L, request));
    }

    @Test
    void aSignUpSheetIgnoresOptionsAndIsNeverAnonymous() {
        CreatePollRequest request = new CreatePollRequest();
        request.setMode("SIGNUP");
        request.setQuestion("Potluck on Saturday");
        request.setAnonymous(true);
        request.setMaxEntries(12);
        request.setOptions(List.of("ignored"));

        Poll created = service.create(42L, 2L, request);

        assertTrue(created.isSignup());
        assertFalse(created.isAnonymous());
        assertEquals(12, created.getMaxEntries());
        verify(options, never()).save(any());
    }

    @Test
    void summariesCarryCountsOrderAndTheViewersOwnChoices() {
        when(votes.countByOptionForPolls(anyCollection()))
                .thenReturn(List.<Object[]>of(new Object[] { 11L, 3L }, new Object[] { 12L, 5L }));
        when(votes.countVotersForPolls(anyCollection())).thenReturn(List.<Object[]>of(new Object[] { 7L, 8L }));
        when(votes.findMine(eq(2L), anyCollection())).thenReturn(List.<Object[]>of(new Object[] { 7L, 11L }));

        Map<Long, PollDto> summaries = service.summaries(List.of(9L, 10L), 2L);

        PollDto dto = summaries.get(9L);
        assertEquals("Tea or coffee?", dto.getQuestion());
        assertEquals(8L, dto.getVoterCount());
        assertEquals(List.of("Tea", "Coffee"), dto.getOptions().stream().map(o -> o.getText()).toList());
        assertEquals(3L, dto.getOptions().get(0).getCount());
        assertEquals(List.of(11L), dto.getMyOptionIds());
        assertFalse(dto.isClosed());
        assertNull(summaries.get(10L));
    }

    private static PollOption option(Long id, Long pollId, String text, int position) {
        PollOption option = new PollOption(pollId, text, null, position, null, NOW.minusSeconds(600));
        option.setId(id);
        return option;
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
