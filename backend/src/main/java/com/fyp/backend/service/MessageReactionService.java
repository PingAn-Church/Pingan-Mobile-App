package com.fyp.backend.service;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.dto.ReactionSummaryDto;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageReaction;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.MessageReactionRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Emoji reactions on chat messages.
 *
 * A reaction is a toggle on one message, never a message of its own: it sends
 * no push, counts as nothing unread, and does not move the conversation in the
 * list. What it does do is re-broadcast the message it sits on, with the new
 * tallies attached, so every open chat redraws that one bubble.
 *
 * The set of emojis is fixed and small. The point is to replace a hundred
 * "阿们" in the church-wide group with one number under the message; a full
 * picker would put the hundred back as a hundred different symbols.
 */
@Service
public class MessageReactionService {

    /** Most code points a single emoji may run to; the family and flag sequences stay well inside it. */
    private static final int MAX_EMOJI_CODE_POINTS = 8;

    /** Cap on the "who reacted" list; past this the number is the answer. */
    static final int MAX_REACTORS = 200;

    private final MessageRepository messageRepository;
    private final MessageReactionRepository reactionRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    // Non-final so tests can pin the time.
    private Clock clock = Clock.systemUTC();

    public MessageReactionService(MessageRepository messageRepository,
            MessageReactionRepository reactionRepository,
            UserRepository userRepository,
            SimpMessagingTemplate messagingTemplate) {
        this.messageRepository = messageRepository;
        this.reactionRepository = reactionRepository;
        this.userRepository = userRepository;
        this.messagingTemplate = messagingTemplate;
    }

    void setClock(Clock clock) {
        this.clock = clock;
    }

    /**
     * "❤️" (with the emoji-presentation selector) and "❤" (without) are the same
     * heart typed on different keyboards; both are stored and compared without it.
     */
    public static String canonical(String emoji) {
        return emoji == null ? "" : emoji.replace("️", "").trim();
    }

    /**
     * Whether the text is exactly one emoji: a pictograph with whatever skin tone,
     * gender or joined sequence it carries (👍, 🙏🏽, 👨‍👩‍👧), a flag (🇨🇳) or a
     * keycap (1️⃣). Letters, words, a bare digit and two emojis side by side are
     * not. Java 21's emoji properties do the character-level work.
     */
    public static boolean isSingleEmoji(String emoji) {
        if (emoji == null || emoji.isEmpty()) {
            return false;
        }
        int[] codePoints = emoji.codePoints().toArray();
        if (codePoints.length > MAX_EMOJI_CODE_POINTS) {
            return false;
        }
        int pictographs = 0;
        int digits = 0;
        int regionalIndicators = 0;
        boolean keycap = false;
        boolean joined = false;
        for (int cp : codePoints) {
            if (cp == 0x200D) { // zero-width joiner: the next pictograph belongs to this one
                joined = true;
                continue;
            }
            if (cp == 0xFE0F || cp == 0xFE0E || Character.isEmojiModifier(cp)
                    || (cp >= 0xE0020 && cp <= 0xE007F)) { // presentation selectors, skin tones, flag tags
                continue;
            }
            if (cp == 0x20E3) { // combining enclosing keycap
                keycap = true;
                continue;
            }
            if (cp >= 0x1F1E6 && cp <= 0x1F1FF) { // regional indicators: two make a flag
                regionalIndicators++;
                continue;
            }
            if (cp == '#' || cp == '*' || (cp >= '0' && cp <= '9')) { // only an emoji under a keycap
                digits++;
                continue;
            }
            if (Character.isExtendedPictographic(cp) || Character.isEmojiPresentation(cp)) {
                if (!joined) {
                    pictographs++;
                }
                joined = false;
                continue;
            }
            return false; // a letter, a space, punctuation: not an emoji at all
        }
        if (digits > 0) {
            return digits == 1 && keycap && pictographs == 0 && regionalIndicators == 0;
        }
        if (regionalIndicators > 0) {
            return regionalIndicators == 2 && pictographs == 0;
        }
        return pictographs == 1;
    }

    /**
     * Adds ({@code on}) or removes the viewer's reaction, idempotently, and
     * re-broadcasts the message with its tallies once the change commits.
     *
     * @return the message as the viewer should now see it, with {@code mine} filled in
     */
    @Transactional
    public MessageDto toggle(Long messageId, Long userId, String rawEmoji, boolean on) {
        String emoji = canonical(rawEmoji);
        if (!isSingleEmoji(emoji)) {
            throw new IllegalArgumentException("A reaction is a single emoji.");
        }
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));
        User viewer = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        boolean participant = message.getConversation().getParticipants().stream()
                .anyMatch(u -> u.getId().equals(userId));
        if (!participant) {
            throw new IllegalArgumentException("You are not part of this conversation.");
        }
        // Hidden from everyone but its sender while under review; nobody else can
        // see it to react, and the sender reacting to their own would only draw eyes.
        if (Boolean.TRUE.equals(message.getReported())) {
            throw new IllegalArgumentException("This message is under review.");
        }

        Optional<MessageReaction> existing =
                reactionRepository.findByMessageIdAndUserIdAndEmoji(messageId, userId, emoji);
        if (on && existing.isEmpty()) {
            reactionRepository.save(new MessageReaction(messageId, userId, emoji, Instant.now(clock)));
        } else if (!on && existing.isPresent()) {
            reactionRepository.delete(existing.get());
            reactionRepository.flush();
        }

        MessageDto forViewer = new MessageDto(message, viewer);
        forViewer.setReactions(summariesFor(messageId, userId));

        // One copy for everyone, so it cannot say whose the reactions are.
        MessageDto forEveryone = new MessageDto(message);
        forEveryone.setReactions(summariesFor(messageId, null));
        List<String> destinations = ChatDestinations.forMessage(message.getConversationType(), forEveryone);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (String destination : destinations) {
                    messagingTemplate.convertAndSend(destination, forEveryone);
                }
            }
        });
        return forViewer;
    }

    /** Clears a message's reactions ahead of deleting it, where the cascading key is not installed. */
    public void removeAllFor(Long messageId) {
        reactionRepository.deleteByMessageId(messageId);
    }

    /** Tallies for one message; see {@link #summaries}. */
    public List<ReactionSummaryDto> summariesFor(Long messageId, Long viewerId) {
        return summaries(List.of(messageId), viewerId).getOrDefault(messageId, List.of());
    }

    /**
     * Tallies for a page of messages in two grouped queries, keyed by message id.
     * Emojis come out in the order they first appeared on the message, so a tally
     * keeps its place as later ones join. Messages nobody reacted to are absent;
     * callers default to an empty list.
     *
     * @param viewerId whose {@code mine} to fill in, or null for a broadcast
     */
    public Map<Long, List<ReactionSummaryDto>> summaries(Collection<Long> messageIds, Long viewerId) {
        if (messageIds == null || messageIds.isEmpty()) {
            return Map.of();
        }
        // message id → emoji → [count, id of the first reaction], in first-seen order
        Map<Long, Map<String, long[]>> counts = new HashMap<>();
        for (Object[] row : reactionRepository.countByMessageIds(messageIds)) {
            counts.computeIfAbsent((Long) row[0], ignored -> new LinkedHashMap<>())
                    .put((String) row[1], new long[] {
                            ((Number) row[2]).longValue(), ((Number) row[3]).longValue() });
        }
        Set<String> mine = new HashSet<>();
        if (viewerId != null) {
            for (Object[] row : reactionRepository.findMineByMessageIds(viewerId, messageIds)) {
                mine.add(row[0] + ":" + row[1]);
            }
        }

        Map<Long, List<ReactionSummaryDto>> result = new LinkedHashMap<>();
        for (Map.Entry<Long, Map<String, long[]>> entry : counts.entrySet()) {
            List<ReactionSummaryDto> tallies = new ArrayList<>();
            entry.getValue().entrySet().stream()
                    .filter(tally -> tally.getValue()[0] > 0)
                    .sorted(Comparator.comparingLong(tally -> tally.getValue()[1]))
                    .forEach(tally -> {
                        String emoji = tally.getKey();
                        Boolean isMine = viewerId == null ? null : mine.contains(entry.getKey() + ":" + emoji);
                        tallies.add(new ReactionSummaryDto(emoji, tally.getValue()[0], isMine));
                    });
            if (!tallies.isEmpty()) {
                result.put(entry.getKey(), tallies);
            }
        }
        return result;
    }

    /**
     * Who reacted with an emoji, for the long-press on a tally. Participants only:
     * the viewer must be in the conversation to be shown its members' names.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> reactors(Long messageId, String rawEmoji, Long viewerId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));
        boolean participant = message.getConversation().getParticipants().stream()
                .anyMatch(u -> u.getId().equals(viewerId));
        if (!participant) {
            throw new IllegalArgumentException("You are not part of this conversation.");
        }
        List<Long> userIds = reactionRepository.findUserIds(messageId, canonical(rawEmoji),
                PageRequest.of(0, MAX_REACTORS));
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
}
