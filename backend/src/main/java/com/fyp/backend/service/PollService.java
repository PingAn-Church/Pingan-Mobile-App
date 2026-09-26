package com.fyp.backend.service;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.CreatePollRequest;
import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.dto.PollDto;
import com.fyp.backend.dto.PollOptionDto;
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

/**
 * Polls and sign-up sheets in chat.
 *
 * Creation is orchestrated by ChatService.createPoll (the poll row is stored
 * here, the message it hangs on is posted there, then the two are bound). Every
 * change afterwards — a vote, a sign-up, a close — is handled here and ends
 * the same way: the poll's message is re-broadcast with the new tallies, so
 * every open chat redraws that one card. Like a reaction, none of this pushes
 * or counts as unread; the poll's creation did that once.
 *
 * Deliberately no dependency on ChatService: ChatService embeds poll
 * summaries into history pages, so this class must sit below it.
 */
@Service
public class PollService {

    static final int MAX_QUESTION = 300;
    static final int MAX_OPTION_TEXT = 200;
    static final int MIN_OPTIONS = 2;
    static final int MAX_OPTIONS = 10;
    static final int MAX_ENTRIES_CAP = 1000;
    /** Cap on a "who chose this" list; past this the number is the answer. */
    static final int MAX_VOTERS = 200;

    private final PollRepository pollRepository;
    private final PollOptionRepository optionRepository;
    private final PollVoteRepository voteRepository;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;
    private final MessageReactionService reactionService;
    private final ContentSanitizer contentSanitizer;
    private final SimpMessagingTemplate messagingTemplate;

    // Non-final so tests can pin the time.
    private Clock clock = Clock.systemUTC();

    public PollService(PollRepository pollRepository,
            PollOptionRepository optionRepository,
            PollVoteRepository voteRepository,
            MessageRepository messageRepository,
            UserRepository userRepository,
            MessageReactionService reactionService,
            ContentSanitizer contentSanitizer,
            SimpMessagingTemplate messagingTemplate) {
        this.pollRepository = pollRepository;
        this.optionRepository = optionRepository;
        this.voteRepository = voteRepository;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.reactionService = reactionService;
        this.contentSanitizer = contentSanitizer;
        this.messagingTemplate = messagingTemplate;
    }

    void setClock(Clock clock) {
        this.clock = clock;
    }

    // --- creation ---------------------------------------------------------------

    /**
     * Validates and stores a poll and its options for a message that is about
     * to be posted. The message id is bound afterwards (see {@link #attachMessage}).
     * The creator's words go through the same filter as any message.
     */
    @Transactional
    public Poll create(Long conversationId, Long creatorId, CreatePollRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Nothing to create.");
        }
        String question = clean(request.getQuestion(), MAX_QUESTION);
        if (question.isEmpty()) {
            throw new IllegalArgumentException("A poll needs a question.");
        }
        String mode = request.getMode() == null ? "" : request.getMode().trim().toUpperCase();
        if (!Poll.SINGLE.equals(mode) && !Poll.MULTI.equals(mode) && !Poll.SIGNUP.equals(mode)) {
            throw new IllegalArgumentException("Unknown poll mode.");
        }
        Instant now = Instant.now(clock);
        if (request.getDeadline() != null && !request.getDeadline().isAfter(now)) {
            throw new IllegalArgumentException("The deadline has to be in the future.");
        }

        List<String> options = new ArrayList<>();
        Integer maxEntries = null;
        if (Poll.SIGNUP.equals(mode)) {
            if (request.getMaxEntries() != null && request.getMaxEntries() > 0) {
                if (request.getMaxEntries() > MAX_ENTRIES_CAP) {
                    throw new IllegalArgumentException("That limit is too large.");
                }
                maxEntries = request.getMaxEntries();
            }
        } else {
            for (String raw : request.getOptions() == null ? List.<String>of() : request.getOptions()) {
                String text = clean(raw, MAX_OPTION_TEXT);
                if (!text.isEmpty()) options.add(text);
            }
            if (options.size() < MIN_OPTIONS || options.size() > MAX_OPTIONS) {
                throw new IllegalArgumentException("A poll needs between 2 and 10 options.");
            }
        }

        Poll poll = new Poll();
        poll.setConversationId(conversationId);
        poll.setCreatorId(creatorId);
        poll.setQuestion(question);
        poll.setMode(mode);
        poll.setAnonymous(request.isAnonymous() && !Poll.SIGNUP.equals(mode));
        poll.setDeadline(request.getDeadline());
        poll.setMaxEntries(maxEntries);
        poll.setCreatedAt(now);
        poll = pollRepository.save(poll);

        int position = 1;
        for (String text : options) {
            optionRepository.save(new PollOption(poll.getId(), text, null, position++, null, now));
        }
        return poll;
    }

    /** Binds a freshly stored poll to the message that now carries it. */
    @Transactional
    public void attachMessage(Long pollId, Long messageId) {
        Poll poll = pollRepository.findById(pollId)
                .orElseThrow(() -> new IllegalArgumentException("Poll not found"));
        poll.setMessageId(messageId);
        pollRepository.save(poll);
    }

    /** Clears a message's poll ahead of deleting it, where the cascading key is not installed. */
    public void removeForMessage(Long messageId) {
        pollRepository.findByMessageId(messageId).ifPresent(poll -> {
            voteRepository.deleteByPollId(poll.getId());
            optionRepository.deleteByPollId(poll.getId());
            pollRepository.delete(poll);
        });
    }

    // --- participation ----------------------------------------------------------

    /**
     * Sets the viewer's choices to exactly {@code optionIds}: one for SINGLE,
     * any number for MULTI, none to withdraw. Idempotent — the same choices
     * again change nothing.
     */
    @Transactional
    public MessageDto vote(Long pollId, Long userId, List<Long> optionIds) {
        Poll poll = lockedPoll(pollId);
        Message message = messageOf(poll);
        User voter = requireParticipant(message, userId);
        requireOpen(poll);
        if (poll.isSignup()) {
            throw new IllegalArgumentException("This is a sign-up sheet — add yourself to it instead.");
        }

        Set<Long> wanted = new LinkedHashSet<>(optionIds == null ? List.of() : optionIds);
        if (Poll.SINGLE.equals(poll.getMode()) && wanted.size() > 1) {
            throw new IllegalArgumentException("Choose one option.");
        }
        Set<Long> valid = new HashSet<>();
        for (PollOption option : optionRepository.findByPollIdOrderByPositionAscIdAsc(pollId)) {
            valid.add(option.getId());
        }
        if (!valid.containsAll(wanted)) {
            throw new IllegalArgumentException("That option is not on this poll.");
        }

        Instant now = Instant.now(clock);
        Set<Long> have = new HashSet<>();
        for (PollVote existing : voteRepository.findByPollIdAndUserId(pollId, userId)) {
            if (wanted.contains(existing.getOptionId())) {
                have.add(existing.getOptionId());
            } else {
                voteRepository.delete(existing);
            }
        }
        for (Long optionId : wanted) {
            if (!have.contains(optionId)) {
                voteRepository.save(new PollVote(pollId, optionId, userId, now));
            }
        }
        voteRepository.flush();
        return rebroadcast(poll, message, voter);
    }

    /**
     * Adds the viewer to a sign-up sheet, once, while there is room. The entry
     * is theirs: shown under their name, with an optional note, and carrying
     * their own vote so head counts read the same as a poll's.
     */
    @Transactional
    public MessageDto addEntry(Long pollId, Long userId, String text, String note) {
        Poll poll = lockedPoll(pollId);
        Message message = messageOf(poll);
        User joiner = requireParticipant(message, userId);
        requireOpen(poll);
        if (!poll.isSignup()) {
            throw new IllegalArgumentException("This poll takes votes, not entries.");
        }
        if (optionRepository.findByPollIdAndCreatedById(pollId, userId).isPresent()) {
            throw new IllegalArgumentException("You are already on the list.");
        }
        long count = optionRepository.countByPollId(pollId);
        if (poll.getMaxEntries() != null && count >= poll.getMaxEntries()) {
            throw new IllegalArgumentException("The list is full.");
        }

        Instant now = Instant.now(clock);
        String entryText = clean(text, MAX_OPTION_TEXT);
        String entryNote = clean(note, MAX_OPTION_TEXT);
        PollOption entry = optionRepository.save(new PollOption(pollId,
                entryText.isEmpty() ? null : entryText,
                entryNote.isEmpty() ? null : entryNote,
                (int) count + 1, userId, now));
        voteRepository.save(new PollVote(pollId, entry.getId(), userId, now));
        voteRepository.flush();
        return rebroadcast(poll, message, joiner);
    }

    /** Takes the viewer off a sign-up sheet, while it is open. Nothing to remove is not an error. */
    @Transactional
    public MessageDto removeEntry(Long pollId, Long userId) {
        Poll poll = lockedPoll(pollId);
        Message message = messageOf(poll);
        User leaver = requireParticipant(message, userId);
        requireOpen(poll);
        optionRepository.findByPollIdAndCreatedById(pollId, userId).ifPresent(entry -> {
            voteRepository.deleteByOptionId(entry.getId());
            optionRepository.delete(entry);
            optionRepository.flush();
        });
        return rebroadcast(poll, message, leaver);
    }

    /** Ends the poll early. The creator may, and so may an admin of the group it is in. */
    @Transactional
    public MessageDto close(Long pollId, Long userId) {
        Poll poll = lockedPoll(pollId);
        Message message = messageOf(poll);
        User closer = requireParticipant(message, userId);
        if (!canManage(poll, message, userId)) {
            throw new IllegalArgumentException("Only the poll's creator or a group admin can close it.");
        }
        if (poll.getClosedAt() == null) {
            poll.setClosedAt(Instant.now(clock));
            pollRepository.save(poll);
        }
        return rebroadcast(poll, message, closer);
    }

    /**
     * Who chose an option — for the tap on a count. Refused on an anonymous
     * poll, where the count is all anyone gets; participants only.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> voters(Long pollId, Long optionId, Long viewerId) {
        Poll poll = pollRepository.findById(pollId)
                .orElseThrow(() -> new IllegalArgumentException("Poll not found"));
        requireParticipant(messageOf(poll), viewerId);
        if (poll.isAnonymous()) {
            throw new IllegalArgumentException("This poll is anonymous.");
        }
        PollOption option = optionRepository.findById(optionId)
                .filter(o -> Objects.equals(o.getPollId(), pollId))
                .orElseThrow(() -> new IllegalArgumentException("That option is not on this poll."));
        List<Long> userIds = voteRepository.findUserIdsByOptionId(option.getId(), PageRequest.of(0, MAX_VOTERS));
        Map<Long, User> users = new HashMap<>();
        userRepository.findAllById(userIds).forEach(u -> users.put(u.getId(), u));

        List<Map<String, Object>> result = new ArrayList<>();
        for (Long id : userIds) {
            User user = users.get(id);
            if (user == null) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", user.getId());
            row.put("firstName", MessageDto.displayFirstName(user));
            row.put("lastName", MessageDto.displayLastName(user));
            row.put("profileImage", user.isDeletedAccount() ? null : user.getProfileImage());
            row.put("bot", user.isBot());
            row.put("displayNameZh", user.isBot() ? user.getDisplayNameZh() : null);
            result.add(row);
        }
        return result;
    }

    // --- summaries --------------------------------------------------------------

    /** The poll on one message, drawn for a viewer (null viewer: no {@code myOptionIds}). */
    public PollDto summaryForMessage(Long messageId, Long viewerId) {
        return summaries(List.of(messageId), viewerId).get(messageId);
    }

    /**
     * The polls behind a page of messages, keyed by message id, in four grouped
     * queries however many polls the page holds. Messages without a poll are
     * simply absent.
     */
    public Map<Long, PollDto> summaries(Collection<Long> messageIds, Long viewerId) {
        if (messageIds == null || messageIds.isEmpty()) {
            return Map.of();
        }
        List<Poll> polls = pollRepository.findByMessageIdIn(messageIds);
        if (polls.isEmpty()) {
            return Map.of();
        }
        List<Long> pollIds = polls.stream().map(Poll::getId).toList();

        Map<Long, List<PollOption>> optionsByPoll = new HashMap<>();
        Set<Long> peopleToName = new HashSet<>();
        for (PollOption option : optionRepository.findByPollIdInOrderByPositionAscIdAsc(pollIds)) {
            optionsByPoll.computeIfAbsent(option.getPollId(), ignored -> new ArrayList<>()).add(option);
            if (option.getCreatedById() != null) peopleToName.add(option.getCreatedById());
        }
        Map<Long, Long> countByOption = new HashMap<>();
        for (Object[] row : voteRepository.countByOptionForPolls(pollIds)) {
            countByOption.put((Long) row[0], ((Number) row[1]).longValue());
        }
        Map<Long, Long> votersByPoll = new HashMap<>();
        for (Object[] row : voteRepository.countVotersForPolls(pollIds)) {
            votersByPoll.put((Long) row[0], ((Number) row[1]).longValue());
        }
        Map<Long, List<Long>> mineByPoll = null;
        if (viewerId != null) {
            mineByPoll = new HashMap<>();
            for (Object[] row : voteRepository.findMine(viewerId, pollIds)) {
                mineByPoll.computeIfAbsent((Long) row[0], ignored -> new ArrayList<>()).add((Long) row[1]);
            }
        }
        Map<Long, User> people = new HashMap<>();
        if (!peopleToName.isEmpty()) {
            userRepository.findAllById(peopleToName).forEach(u -> people.put(u.getId(), u));
        }

        Instant now = Instant.now(clock);
        Map<Long, PollDto> result = new LinkedHashMap<>();
        for (Poll poll : polls) {
            PollDto dto = new PollDto();
            dto.setId(poll.getId());
            dto.setMessageId(poll.getMessageId());
            dto.setCreatorId(poll.getCreatorId());
            dto.setQuestion(poll.getQuestion());
            dto.setMode(poll.getMode());
            dto.setAnonymous(poll.isAnonymous());
            dto.setDeadline(poll.getDeadline() == null ? null : poll.getDeadline().toEpochMilli());
            dto.setMaxEntries(poll.getMaxEntries());
            dto.setClosed(isClosed(poll, now));
            dto.setClosedAt(poll.getClosedAt() == null ? null : poll.getClosedAt().toEpochMilli());
            dto.setVoterCount(votersByPoll.getOrDefault(poll.getId(), 0L));
            dto.setMyOptionIds(mineByPoll == null ? null : mineByPoll.getOrDefault(poll.getId(), List.of()));
            for (PollOption option : optionsByPoll.getOrDefault(poll.getId(), List.of())) {
                User creator = option.getCreatedById() == null ? null : people.get(option.getCreatedById());
                dto.getOptions().add(new PollOptionDto(
                        option.getId(),
                        option.getText(),
                        option.getNote(),
                        option.getPosition(),
                        option.getCreatedById(),
                        creator == null ? null : MessageDto.displayFirstName(creator),
                        creator == null ? null : MessageDto.displayLastName(creator),
                        creator != null && creator.isBot(),
                        creator != null && creator.isBot() ? creator.getDisplayNameZh() : null,
                        countByOption.getOrDefault(option.getId(), 0L)));
            }
            if (poll.getMessageId() != null) {
                result.put(poll.getMessageId(), dto);
            }
        }
        return result;
    }

    // --- helpers ----------------------------------------------------------------

    private Poll lockedPoll(Long pollId) {
        return pollRepository.findByIdForUpdate(pollId)
                .orElseThrow(() -> new IllegalArgumentException("Poll not found"));
    }

    private Message messageOf(Poll poll) {
        if (poll.getMessageId() == null) {
            throw new IllegalArgumentException("This poll is not in a conversation yet.");
        }
        return messageRepository.findById(poll.getMessageId())
                .orElseThrow(() -> new IllegalArgumentException("The poll's message no longer exists."));
    }

    private User requireParticipant(Message message, Long userId) {
        boolean participant = message.getConversation() != null
                && message.getConversation().getParticipants().stream()
                        .anyMatch(u -> u.getId().equals(userId));
        if (!participant) {
            throw new IllegalArgumentException("You are not part of this conversation.");
        }
        return userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
    }

    private void requireOpen(Poll poll) {
        if (isClosed(poll, Instant.now(clock))) {
            throw new IllegalArgumentException("This poll has closed.");
        }
    }

    static boolean isClosed(Poll poll, Instant now) {
        return poll.getClosedAt() != null
                || (poll.getDeadline() != null && !poll.getDeadline().isAfter(now));
    }

    private static boolean canManage(Poll poll, Message message, Long userId) {
        if (Objects.equals(poll.getCreatorId(), userId)) {
            return true;
        }
        return message.getConversation() instanceof GroupConversation group
                && group.getAdmins() != null
                && group.getAdmins().stream().anyMatch(a -> a.getId().equals(userId));
    }

    /**
     * The poll's message, re-broadcast with the new tallies once the change
     * commits. One copy for everyone (no {@code myOptionIds}); the caller's own
     * copy, with theirs, is what this returns. Reaction tallies ride along, or
     * the client would take the update as "no reactions" and drop them.
     */
    private MessageDto rebroadcast(Poll poll, Message message, User viewer) {
        MessageDto everyone = new MessageDto(message);
        everyone.setPoll(summaryForMessage(message.getId(), null));
        everyone.setReactions(reactionService.summariesFor(message.getId(), null));
        List<String> destinations = ChatDestinations.forMessage(message.getConversationType(), everyone);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (String destination : destinations) {
                    messagingTemplate.convertAndSend(destination, everyone);
                }
            }
        });

        MessageDto mine = new MessageDto(message, viewer);
        mine.setPoll(summaryForMessage(message.getId(), viewer.getId()));
        mine.setReactions(reactionService.summariesFor(message.getId(), viewer.getId()));
        return mine;
    }

    /** Trimmed, filtered for objectionable words, and cut to length; "" for nothing. */
    private String clean(String raw, int max) {
        if (raw == null) return "";
        String text = contentSanitizer.mask(raw.trim());
        if (text == null) return "";
        return text.length() > max ? text.substring(0, max) : text;
    }
}
