package com.fyp.backend.service;

import com.fyp.backend.dto.CreatePollRequest;
import com.fyp.backend.dto.MessageDto;
import com.fyp.backend.dto.PollDto;
import com.fyp.backend.dto.ReactionSummaryDto;
import com.fyp.backend.dto.ReplyPreviewDto;
import com.fyp.backend.exception.ContentUnderReviewException;
import com.fyp.backend.model.*;
import com.fyp.backend.mq.FanoutPublisher;
import com.fyp.backend.repository.*;
import com.fyp.backend.util.Pagination;
import jakarta.transaction.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final MessageRepository messageRepository;
    private final GroupConversationRepository groupConversationRepository;
    private final PrivateConversationRepository privateConversationRepository;
    private final UserRepository userRepository;
    private final MessageDeliveryStatusRepository messageDeliveryStatusRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final OssCleanupService ossCleanupService;
    private final FanoutPublisher fanoutPublisher;
    private final UserBlockService userBlockService;
    private final ContentSanitizer contentSanitizer;
    private final PushMessages pushMessages;
    private final ConversationReadStateService conversationReadStateService;
    private final AssistantAccountService assistantAccountService;
    private final EventRepository eventRepository;
    private final MessageReactionService reactionService;
    private final PollService pollService;

    @Autowired
    public ChatService(MessageRepository messageRepository,
                       GroupConversationRepository groupConversationRepository,
                       PrivateConversationRepository privateConversationRepository,
                       UserRepository userRepository,
                       MessageDeliveryStatusRepository messageDeliveryStatusRepository, SimpMessagingTemplate messagingTemplate,
                       OssCleanupService ossCleanupService,
                       FanoutPublisher fanoutPublisher,
                       UserBlockService userBlockService,
                       ContentSanitizer contentSanitizer,
                       PushMessages pushMessages,
                       ConversationReadStateService conversationReadStateService,
                       AssistantAccountService assistantAccountService,
                       EventRepository eventRepository,
                       MessageReactionService reactionService,
                       PollService pollService) {
        this.messageRepository = messageRepository;
        this.groupConversationRepository = groupConversationRepository;
        this.privateConversationRepository = privateConversationRepository;
        this.userRepository = userRepository;
        this.messageDeliveryStatusRepository = messageDeliveryStatusRepository;
        this.messagingTemplate = messagingTemplate;
        this.ossCleanupService = ossCleanupService;
        this.fanoutPublisher = fanoutPublisher;
        this.userBlockService = userBlockService;
        this.contentSanitizer = contentSanitizer;
        this.pushMessages = pushMessages;
        this.conversationReadStateService = conversationReadStateService;
        this.assistantAccountService = assistantAccountService;
        this.eventRepository = eventRepository;
        this.reactionService = reactionService;
        this.pollService = pollService;
    }

    private Conversation getConversationByTypeAndId(Long conversationId, String conversationType) {
        if ("group".equals(conversationType)) {
            return groupConversationRepository.findById(conversationId)
                    .orElseThrow(() -> new IllegalArgumentException("Group conversation not found"));
        } else if ("private".equals(conversationType)) {
            return privateConversationRepository.findById(conversationId)
                    .orElseThrow(() -> new IllegalArgumentException("Private conversation not found"));
        } else {
            throw new IllegalArgumentException("Invalid conversation type");
        }
    }


    private User getUserById(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
    }

    private void checkUserIsParticipant(Conversation conversation, Long userId) {
        boolean isParticipant = conversation.getParticipants()
                .stream()
                .anyMatch(user -> user.getId().equals(userId));
        if (!isParticipant) {
            throw new IllegalArgumentException("User is not part of this conversation");
        }
    }

    /**
     * Writes the per-recipient receipts behind the ✓✓ / Seen tick.
     *
     * Private chats only. A group would write one row per member per message —
     * hundreds per message in the church-wide group — and the client collapses
     * the whole map to a single word anyway, so nothing could read the detail
     * back out. Groups get no ticks, which is the same call Telegram makes;
     * whether a group message has been read is answered by the read watermark
     * instead (see ConversationReadStateService).
     */
    private void createDeliveryStatuses(Conversation conversation, User sender, Message message, Timestamp timestamp) {
        if (!(conversation instanceof PrivateConversation)) {
            return;
        }

        List<User> recipients = conversation.getParticipants()
                .stream()
                .filter(user -> !user.getId().equals(sender.getId()))
                .toList();

        List<MessageDeliveryStatus> deliveryStatuses = new ArrayList<>();
        for (User recipient : recipients) {
            MessageDeliveryStatus deliveryStatus = new MessageDeliveryStatus(message, recipient, "SENT", timestamp);
            deliveryStatuses.add(deliveryStatus);
            messageDeliveryStatusRepository.save(deliveryStatus);
        }

        message.setDeliveryStatuses(deliveryStatuses);
        messageRepository.save(message);  // Save again to update delivery statuses
    }

    private MessageDto buildResponseDto(Message message, Conversation conversation) {
        MessageDto responseDto = new MessageDto(message);
        // Recipients exclude the sender — the fan-out echoes to the sender's queue
        // separately, and the sender must never be push-notified for their own message.
        List<Long> recipientIds = conversation.getParticipants().stream()
                .map(User::getId)
                .filter(id -> !id.equals(message.getSender().getId()))
                .collect(Collectors.toList());
        // Group clients receive one authorized conversation-topic broadcast and do
        // not need the full roster repeated in every payload. Private chat keeps its
        // single recipient so the worker can address both user queues.
        responseDto.setRecipientIds(conversation instanceof PrivateConversation
                ? recipientIds
                : List.of());
        return responseDto;
    }

    private MessageDeliveryStatus getDeliveryStatus(Long messageId, Long userId) {
        return messageDeliveryStatusRepository.findByMessageId(messageId)
                .stream()
                .filter(ds -> ds.getUser().getId().equals(userId))
                .findFirst()
                .orElse(null);
    }

    /**
     * Cursor-paginated chat history, newest-first internally but returned oldest->newest
     * for natural rendering. `before` is the smallest message id already loaded (null for
     * the first page). Returns { messages, nextCursor, hasMore }.
     */
    public Map<String, Object> getChatHistoryPage(Long conversationId, String conversationType,
            Long userId, Long before, int size) {
        Conversation conversation = getConversationByTypeAndId(conversationId, conversationType);
        checkUserIsParticipant(conversation, userId);

        int safeSize = Pagination.clampSize(size, 100);
        Pageable pageable = PageRequest.of(0, safeSize);

        List<Message> desc = (before == null)
                ? messageRepository.findByConversationIdOrderByIdDesc(conversationId, pageable)
                : messageRepository.findByConversationIdAndIdLessThanOrderByIdDesc(conversationId, before, pageable);

        boolean hasMore = desc.size() == safeSize;
        Long nextCursor = desc.isEmpty() ? null : desc.get(desc.size() - 1).getId();

        List<Message> ascending = new ArrayList<>(desc);
        Collections.reverse(ascending);
        User viewer = getUserById(userId);
        List<MessageDto> messages = ascending.stream()
                .map(message -> new MessageDto(message, viewer))
                .collect(Collectors.toList());

        // Reaction tallies for the whole page in two grouped queries, with the
        // viewer's own marked.
        List<Long> messageIds = messages.stream().map(MessageDto::getMessageId).toList();
        Map<Long, List<ReactionSummaryDto>> tallies = reactionService.summaries(messageIds, userId);
        messages.forEach(dto -> dto.setReactions(tallies.getOrDefault(dto.getMessageId(), List.of())));
        // Likewise the polls behind any "poll" messages on the page.
        Map<Long, PollDto> polls = pollService.summaries(messageIds, userId);
        messages.forEach(dto -> dto.setPoll(polls.get(dto.getMessageId())));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("messages", messages);
        result.put("nextCursor", nextCursor);
        result.put("hasMore", hasMore);
        return result;
    }


    private List<String> getDestination(String conversationType, MessageDto savedMessage) {
        return ChatDestinations.forMessage(conversationType, savedMessage);
    }

    public void broadcastMessageAfterCommit(Message message) {
        MessageDto dto = new MessageDto(message);
        dto.setReactions(reactionService.summariesFor(message.getId(), null));
        List<String> destinations = getDestination(message.getConversationType(), dto);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (String destination : destinations) {
                    messagingTemplate.convertAndSend(destination, dto);
                }
            }
        });
    }

    /**
     * The push title, resolved per recipient. A private chat shows the sender's
     * name in the reader's own name order (Chinese puts the family name first);
     * a group shows its name, which is the same for everyone. Both are read here,
     * inside the transaction, so the deferred send never touches a detached entity.
     */
    private LocalizedText getPushNotificationTitle(String conversationType, User sender, Long conversationId) {
        if ("private".equals(conversationType)) {
            return pushMessages.personName(sender.getFirstName(), sender.getLastName());
        } else if ("group".equals(conversationType)) {
            GroupConversation group = groupConversationRepository.findById(conversationId)
                    .orElseThrow(() -> new RuntimeException("Group conversation not found"));
            return pushMessages.literal(group.getGroupName());
        }
        return pushMessages.text("push.chat.newMessage");
    }

    /**
     * The push body. Text messages carry the sender's own words through
     * untouched; the media placeholders are ours to write, so they follow the
     * recipient's language.
     */
    private LocalizedText getPushNotificationBody(MessageDto messageDto) {
        if (messageDto == null) {
            return pushMessages.text("push.chat.newMessage");
        }

        MessageKind kind = MessageKind.of(messageDto.getType());
        if (kind == MessageKind.EVENT) {
            return pushMessages.text(kind.pushBodyKey(), sharedEventTitle(messageDto));
        }
        if (kind.pushBodyKey() != null) {
            return pushMessages.text(kind.pushBodyKey());
        }
        String content = messageDto.getContent();
        return (content == null || content.trim().isEmpty())
                ? pushMessages.text("push.chat.newMessage")
                : pushMessages.literal(content);
    }

    /**
     * The message a reply quotes. Checked here because the id comes from the
     * client: it must exist and sit in this same conversation, or a message
     * could quote something from a chat its sender was never part of.
     */
    private Message resolveReplyTarget(Long replyToMessageId, Conversation conversation) {
        if (replyToMessageId == null) {
            return null;
        }
        Message quoted = messageRepository.findById(replyToMessageId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "The message you are replying to no longer exists."));
        if (quoted.getConversation() == null
                || !quoted.getConversation().getId().equals(conversation.getId())) {
            throw new IllegalArgumentException("You can only reply to a message in this conversation.");
        }
        return quoted;
    }

    /**
     * The quoted message's author as a push recipient, or null when there is
     * nobody to tell: replying to yourself, or to the assistant, or to somebody
     * who has since left the conversation.
     */
    private Long replyRecipient(Message message, Conversation conversation, User sender) {
        Message quoted = message.getReplyTo();
        if (quoted == null || quoted.getSender() == null) {
            return null;
        }
        // A pin quotes the message it pins; that is an announcement, not an answer.
        if (MessageKind.of(message.getType()) == MessageKind.NOTICE) {
            return null;
        }
        User author = quoted.getSender();
        if (author.getId().equals(sender.getId()) || author.isBot()) {
            return null;
        }
        boolean participant = conversation.getParticipants().stream()
                .anyMatch(u -> u.getId().equals(author.getId()));
        return participant ? author.getId() : null;
    }

    /** The shared event's title for the push body, read inside the send transaction. */
    private String sharedEventTitle(MessageDto messageDto) {
        Long eventId = messageDto.getSharedEventId();
        String title = eventId == null ? null
                : eventRepository.findById(eventId).map(Event::getTitle).orElse(null);
        return title == null ? "" : title.trim();
    }

    /**
     * Trims a message's mentions down to what the sender was actually entitled to.
     *
     * The client picks names from a list, but the payload is still just a request:
     * it could name someone who is not in the conversation, or claim @all without
     * the standing to use it. Both are corrected here rather than trusted, and
     * mentions are meaningless in a private chat where there is only one listener.
     */
    private void sanitiseMentions(Message message, Conversation conversation, User sender, String conversationType) {
        if (!"group".equals(conversationType)) {
            message.setMentionedUserIds(new HashSet<>());
            message.setMentionsEveryone(false);
            return;
        }

        Set<Long> requested = message.getMentionedUserIds() == null
                ? new HashSet<>()
                : new HashSet<>(message.getMentionedUserIds());
        // Mentioning yourself would only push you a notification about your own
        // message, so it is dropped alongside anyone who isn't in the group.
        requested.remove(sender.getId());
        requested.removeIf(id -> !groupConversationRepository.isParticipant(conversation.getId(), id));
        message.setMentionedUserIds(requested);

        // @all reaches everyone at once, so it stays with the group's admins —
        // which, in the app-level group, means the app admins.
        boolean isGroupAdmin = conversation instanceof GroupConversation group
                && group.getAdmins() != null
                && group.getAdmins().stream().anyMatch(u -> u.getId().equals(sender.getId()));
        message.setMentionsEveryone(Boolean.TRUE.equals(message.getMentionsEveryone()) && isGroupAdmin);
    }

    /**
     * Which recipients this message calls out. @all expands here rather than at
     * write time, so the app-level group stores one flag instead of a mention row
     * per member per message.
     */
    private List<Long> resolveMentionedRecipients(Message message, Conversation conversation, User sender) {
        if (Boolean.TRUE.equals(message.getMentionsEveryone())) {
            return conversation.getParticipants().stream()
                    .map(User::getId)
                    .filter(id -> !id.equals(sender.getId()))
                    .collect(Collectors.toList());
        }
        return message.getMentionedUserIds() == null
                ? List.of()
                : new ArrayList<>(message.getMentionedUserIds());
    }

    /**
     * Whether this message asks the assistant to answer.
     *
     * The primary signal is an id comparison against the mentions the sender
     * requested. The fallback is the text itself: a client holding a stale copy of
     * the conversation (group-update broadcasts and mid-session merges can leave
     * the assistant's identity fields behind) offers no assistant entry in its @
     * picker, so people type "@平安小助手" or "@ShalomBot" out by hand and the message
     * arrives with no mention id bound. A summons typed in good faith must not die
     * over which of the two the client managed.
     *
     * Deliberately NOT triggered by @all: an admin broadcasting to the whole church
     * is addressing people, not summoning a bot. Also never triggered by the
     * assistant's own messages — sanitiseMentions already strips self-mentions, but
     * this survives that rule changing.
     *
     * A recognised summons that is refused (assistant switched off, or flagged on
     * without being a participant) is logged: a mentioned-but-silent assistant used
     * to leave no trace at all, which made "the bot did not answer" undiagnosable.
     */
    private boolean summonsAssistant(Message message, Conversation conversation, User sender,
                                     Set<Long> requestedMentions) {
        if (sender.isBot() || Boolean.TRUE.equals(message.getMentionsEveryone())) {
            return false;
        }
        if (!(conversation instanceof GroupConversation group)) {
            return false;
        }
        // Almost no message mentions anyone; skip the account lookup for those.
        String content = message.getContent();
        if (requestedMentions.isEmpty() && (content == null || content.indexOf('@') < 0)) {
            return false;
        }

        User assistant = assistantAccountService.findAssistant().orElse(null);
        if (assistant == null) {
            return false;
        }
        boolean summoned = requestedMentions.contains(assistant.getId())
                || mentionsAssistantByName(content, assistant);
        if (!summoned) {
            return false;
        }

        if (!group.isAssistantEnabled()) {
            log.info("Message {} in group {} mentions the assistant, but the assistant is "
                    + "switched off there; not answering.", message.getId(), group.getId());
            return false;
        }
        if (!groupConversationRepository.isParticipant(group.getId(), assistant.getId())) {
            log.warn("Group {} has the assistant enabled but not on its participant list; "
                    + "ignoring a mention of it. The boot-time reconcile will switch the "
                    + "flag off unless the assistant is re-added.", group.getId());
            return false;
        }
        return true;
    }

    /**
     * A typed-out summons: the text names the assistant in either language. The
     * names come off the assistant's own row, so a rename keeps this in step.
     */
    private boolean mentionsAssistantByName(String content, User assistant) {
        if (content == null || content.indexOf('@') < 0) {
            return false;
        }
        String en = assistant.getFirstName();
        if (en != null && !en.isBlank() && content.toLowerCase(Locale.ROOT)
                .contains("@" + en.toLowerCase(Locale.ROOT))) {
            return true;
        }
        String zh = assistant.getDisplayNameZh();
        return zh != null && !zh.isBlank() && content.contains("@" + zh);
    }

    /**
     * Posts the assistant's answer, as an ordinary message from its account.
     *
     * Idempotency lives here rather than in the worker: {@code respondsToMessageId}
     * carries a partial unique index, so a redelivered task — or a retry after the
     * handler failed downstream of this insert — collides instead of posting a
     * second reply. The collision is a normal outcome, not an error.
     *
     * The reply mentions whoever asked. There is no reply-to in the schema, so in a
     * busy group an unattached answer is hard to place; the mention also gives them
     * the conversation-row marker and a push that ignores their mute, which is
     * reasonable for an answer they are waiting on.
     *
     * @return the posted reply, or null if one already existed
     */
    @Transactional
    public MessageDto sendAssistantReply(Long conversationId, Long triggerMessageId,
                                         Long askerId, User assistant, String content) {
        Conversation conversation = getConversationByTypeAndId(conversationId, "group");
        checkUserIsParticipant(conversation, assistant.getId());

        // Asked before inserting, not discovered by catching the unique index.
        // Once a constraint violation marks this transaction rollback-only, catching
        // it changes nothing — the commit still fails, with UnexpectedRollbackException.
        if (triggerMessageId != null
                && messageRepository.existsByRespondsToMessageId(triggerMessageId)) {
            return null;
        }

        Timestamp timestamp = new Timestamp(System.currentTimeMillis());
        MessageDto outgoing = new MessageDto();
        outgoing.setContent(contentSanitizer.mask(content));
        outgoing.setType("text");
        outgoing.setConversationType("group");
        outgoing.setMentionedUserIds(askerId == null ? List.of() : List.of(askerId));

        Message message = new Message(outgoing, conversation, assistant, timestamp.toString());
        message.setConversationType("group");
        message.setRespondsToMessageId(triggerMessageId);
        // The answer also quotes the question, so in a busy group it sits under
        // what it answers. The mention above still carries the push.
        if (triggerMessageId != null) {
            message.setReplyTo(messageRepository.findById(triggerMessageId).orElse(null));
        }
        sanitiseMentions(message, conversation, assistant, "group");

        // Not wrapped in a try/catch: a violation here means two workers raced past
        // the check above, and the only honest thing to do is let it out. Swallowing
        // it would leave the transaction rollback-only and fail at commit anyway.
        // AssistantService recognises the race and stays quiet rather than posting a
        // second reply — the other worker's answer is already in the group.
        message = messageRepository.saveAndFlush(message);

        MessageDto savedMessage = buildResponseDto(message, conversation);
        LocalizedText notificationTitle =
                getPushNotificationTitle("group", assistant, conversationId);
        LocalizedText assistantName =
                pushMessages.personName(assistant.getFirstName(), assistant.getLastName());
        LocalizedText mentionedBody = language -> pushMessages.get(
                language, "push.chat.mentionedYou", assistantName.render(language));

        // Only the asker is pushed. Everyone else still sees the answer in the group
        // and still gets the unread count, but one member's Bible question must not
        // vibrate several hundred phones — that is how a feature gets muted into
        // uselessness in a week. Hence an EMPTY plain-recipient batch.
        List<Long> mentionedRecipients = resolveMentionedRecipients(message, conversation, assistant);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                fanoutPublisher.publishChat(savedMessage, List.of(), mentionedRecipients,
                        notificationTitle, mentionedBody, mentionedBody);
            }
        });
        return savedMessage;
    }

    /**
     * Turns an event share request into the message that is stored.
     *
     * The client names the event; everything else is ours. The id is checked
     * against a real event, and the body is written here as one language-neutral
     * line — "📅 Title · 2026-10-04 10:00 AM · Hall" — rather than accepted from
     * the client. That line is what every reader without the card sees: builds
     * that predate event shares draw an unknown type as a text bubble, and it is
     * also the chat-list preview, the copy text and what the assistant reads. The
     * card itself loads the live event by id, so an edited event never shows the
     * stale line to anyone who has the card.
     *
     * The id may also arrive as the body, for a client that only fills content.
     */
    private void prepareEventShare(MessageDto messageDto) {
        Long eventId = messageDto.getSharedEventId();
        if (eventId == null && messageDto.getContent() != null) {
            try {
                eventId = Long.parseLong(messageDto.getContent().trim());
            } catch (NumberFormatException ignored) {
                // falls through to the missing-id error below
            }
        }
        if (eventId == null) {
            throw new IllegalArgumentException("An event share must name an event.");
        }
        Event event = eventRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("That event no longer exists."));

        messageDto.setType(MessageKind.EVENT.type());
        messageDto.setSharedEventId(event.getId());
        messageDto.setContent(eventShareText(event));
        messageDto.setMentionedUserIds(new ArrayList<>());
        messageDto.setMentionsEveryone(false);
    }

    static String eventShareText(Event event) {
        StringBuilder text = new StringBuilder("📅 ");
        text.append(event.getTitle() == null ? "" : event.getTitle().trim());
        String when = ((event.getDate() == null ? "" : event.getDate().trim()) + " "
                + (event.getStartTime() == null ? "" : event.getStartTime().trim())).trim();
        if (!when.isEmpty()) {
            text.append(" · ").append(when);
        }
        if (event.getLocation() != null && !event.getLocation().isBlank()) {
            text.append(" · ").append(event.getLocation().trim());
        }
        return text.toString();
    }

    /**
     * Posts the "📌" line that announces a pinned message, as a message from the
     * admin who pinned it. Server-written and quoting the pinned message, so a
     * build without the banner still sees what was pinned; pushed as "Group
     * notice" by the ordinary fan-out. The body is language-neutral: an excerpt
     * of the pinned words, or the media placeholder for a pinned photo or voice.
     */
    public MessageDto postGroupNotice(Long conversationId, User admin, Message pinned) {
        // Words (and the server-written lines of a share or a poll) are quoted as
        // they stand; a photo or voice note becomes its placeholder.
        MessageKind pinnedKind = MessageKind.of(pinned.getType());
        String body = pinnedKind.hasMediaBody()
                ? pinnedKind.readable(pinned.getContent())
                : ReplyPreviewDto.excerpt(pinned.getContent());

        MessageDto notice = new MessageDto();
        notice.setConversationId(conversationId);
        notice.setSenderId(admin.getId());
        notice.setConversationType("group");
        notice.setType(MessageKind.NOTICE.type());
        notice.setReplyToMessageId(pinned.getId());
        notice.setContent("📌 " + (body == null ? "" : body));
        return sendMessageAndBroadcast(notice, "group");
    }

    /**
     * Creates a poll (or sign-up sheet) and posts the message that carries it.
     *
     * The poll row is stored first, then the message goes out through the
     * ordinary send path — same participant check, same fan-out and push — with
     * a server-written body ("📊 question", "📝 question" for a sign-up sheet)
     * that a build without the card shows as text. Once the message has an id
     * the two are bound, and the outgoing copy carries the poll.
     *
     * Groups only: two people voting in a private chat is a conversation.
     */
    @Transactional
    public MessageDto createPoll(String conversationType, Long creatorId, CreatePollRequest request) {
        if (request == null || request.getConversationId() == null) {
            throw new IllegalArgumentException("Which conversation?");
        }
        Conversation conversation = getConversationByTypeAndId(request.getConversationId(), conversationType);
        if (!(conversation instanceof GroupConversation)) {
            throw new IllegalArgumentException("Polls can only be created in a group.");
        }
        checkUserIsParticipant(conversation, creatorId);

        Poll poll = pollService.create(conversation.getId(), creatorId, request);

        MessageDto outgoing = new MessageDto();
        outgoing.setConversationId(conversation.getId());
        outgoing.setSenderId(creatorId);
        outgoing.setConversationType(conversationType);
        outgoing.setType(MessageKind.POLL.type());
        outgoing.setContent((poll.isSignup() ? "📝 " : "📊 ") + poll.getQuestion());
        PollDto handle = new PollDto();
        handle.setId(poll.getId());
        outgoing.setPoll(handle);
        return sendMessageAndBroadcast(outgoing, conversationType);
    }

    @Transactional
    public MessageDto sendMessageAndBroadcast(MessageDto messageDto, String conversationType) {
        Conversation conversation = getConversationByTypeAndId(messageDto.getConversationId(), conversationType);
        User sender = getUserById(messageDto.getSenderId());
        checkUserIsParticipant(conversation, sender.getId());

        // Server-side block enforcement (the client mutes its composer, but that's
        // cosmetic): private messages are refused while either participant blocks
        // the other. Group messages are unaffected by design.
        if ("private".equals(conversationType)) {
            Long otherId = conversation.getParticipants().stream()
                    .map(User::getId)
                    .filter(id -> !id.equals(sender.getId()))
                    .findFirst()
                    .orElse(null);
            if (otherId != null && userBlockService.isMessagingBlocked(sender.getId(), otherId)) {
                throw new IllegalArgumentException("Messaging is unavailable — one of you has blocked the other.");
            }
        }

        MessageKind kind = MessageKind.of(messageDto.getType());
        if (kind == MessageKind.EVENT) {
            // Server-written from the event itself, so there is nothing of the
            // sender's to filter — see prepareEventShare.
            prepareEventShare(messageDto);
        } else {
            // Only an event share may point at an event.
            messageDto.setSharedEventId(null);
            // Objectionable-word filter — only the sender's own words. A media body
            // is a URL, and a notice was written by the server (postGroupNotice).
            if (!kind.hasMediaBody() && !kind.serverWritesBody()) {
                messageDto.setContent(contentSanitizer.mask(messageDto.getContent()));
            }
        }

        Timestamp timestamp = new Timestamp(System.currentTimeMillis());
        Message message = new Message(messageDto, conversation, sender, timestamp.toString());
        message.setReplyTo(resolveReplyTarget(messageDto.getReplyToMessageId(), conversation));
        // What the sender asked for, kept from before sanitiseMentions trims it: the
        // assistant summons check reads this so a stripped assistant mention can be
        // recognised and logged instead of vanishing without a trace.
        Set<Long> requestedMentions = message.getMentionedUserIds() == null
                ? Set.of()
                : new HashSet<>(message.getMentionedUserIds());
        sanitiseMentions(message, conversation, sender, conversationType);
        message = messageRepository.save(message);

        createDeliveryStatuses(conversation, sender, message, timestamp);

        MessageDto savedMessage = buildResponseDto(message, conversation);
        // A poll created through createPoll rode in on the DTO; now that the
        // message has an id, bind them and put the poll on the outgoing copy.
        if (kind == MessageKind.POLL) {
            if (messageDto.getPoll() != null && messageDto.getPoll().getId() != null) {
                pollService.attachMessage(messageDto.getPoll().getId(), message.getId());
            }
            savedMessage.setPoll(pollService.summaryForMessage(message.getId(), null));
        }
        LocalizedText notificationTitle = getPushNotificationTitle(conversationType, sender, savedMessage.getConversationId());
        LocalizedText notificationBody = getPushNotificationBody(savedMessage);
        LocalizedText senderName = pushMessages.personName(sender.getFirstName(), sender.getLastName());

        // Mentioned people get their own push — one that names who called them and
        // is not silenced by a mute — so they are split out of the ordinary fan-out
        // rather than being notified twice.
        List<Long> mentionedRecipients = new ArrayList<>(resolveMentionedRecipients(message, conversation, sender));
        // The person being replied to is told the same way: named, and past a
        // mute. When nobody else was called out the push is worded as a reply; a
        // message that also @-mentions people keeps the mention wording for all.
        Long repliedTo = replyRecipient(message, conversation, sender);
        final boolean wordedAsReply = repliedTo != null && mentionedRecipients.isEmpty();
        if (repliedTo != null && !mentionedRecipients.contains(repliedTo)) {
            mentionedRecipients.add(repliedTo);
        }
        List<Long> allRecipients = conversation.getParticipants().stream()
                .map(User::getId)
                .filter(id -> !id.equals(sender.getId()))
                .toList();
        Set<Long> mentionedRecipientIds = new HashSet<>(mentionedRecipients);
        List<Long> plainRecipients = allRecipients.stream()
                .filter(id -> !mentionedRecipientIds.contains(id))
                .collect(Collectors.toList());
        LocalizedText mentionedBody = language -> pushMessages.get(
                language, wordedAsReply ? "push.chat.repliedToYou" : "push.chat.mentionedYou",
                senderName.render(language));

        // Whether this message summons the assistant — see summonsAssistant for the
        // id-first, text-fallback rules and why refusals are logged.
        boolean assistantSummoned = summonsAssistant(message, conversation, sender, requestedMentions);
        Long triggerMessageId = message.getId();

        // Defer messaging and bounded push batches until the message row commits.
        // Rabbit retries each batch independently, while reconnect history remains
        // the source of truth if the broker is unavailable at this boundary.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                fanoutPublisher.publishChat(savedMessage, plainRecipients,
                        mentionedRecipients, notificationTitle, notificationBody,
                        mentionedBody);
                if (assistantSummoned) {
                    fanoutPublisher.publishAssistantReply(
                            savedMessage.getConversationId(), triggerMessageId, sender.getId());
                }
            }
        });

        return savedMessage;
    }

    @Transactional
    public String updateMessageStatusAuthorized(Long messageId, Long conversationId, Long userId, String status) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));
        if (!conversationId.equals(message.getConversation().getId())) {
            throw new IllegalArgumentException("Message does not belong to this conversation");
        }
        checkUserIsParticipant(message.getConversation(), userId);

        // Group messages carry no receipts by design — read state there is a
        // watermark — but clients still report delivered/read for every message
        // they draw, and builds released before that change always will. Saying
        // "nothing was recorded" here is what lets the caller skip a broadcast
        // that would otherwise wake every member of the conversation: several
        // hundred sockets per receipt in the church-wide group, to no effect.
        if (!(message.getConversation() instanceof PrivateConversation)) {
            return null;
        }

        MessageDeliveryStatus deliveryStatus = getDeliveryStatus(messageId, userId);
        if (deliveryStatus == null) {
            return null;
        }
        deliveryStatus.setStatus(status);
        deliveryStatus.setTimestamp(new Timestamp(System.currentTimeMillis()));
        messageDeliveryStatusRepository.save(deliveryStatus);
        return message.getConversationType();
    }

    /**
     * Marks every message in a conversation as read for one user.
     *
     * One watermark move, whatever the size of the history — the old version had
     * to touch a row per message per member, which in a large group was thousands
     * of writes to clear one badge.
     *
     * Private chats also flip their receipts, so the other person's ✓✓ turns to
     * Seen. Groups have no receipts to flip.
     *
     * @return the user's remaining unread in this conversation — zero unless
     *         something arrived mid-flight.
     */
    @Transactional
    public long markConversationRead(Long userId, Long conversationId, String conversationType) {
        Conversation conversation = getConversationByTypeAndId(conversationId, conversationType);
        checkUserIsParticipant(conversation, userId);

        conversationReadStateService.markRead(conversationId, userId);

        if (conversation instanceof PrivateConversation) {
            messageDeliveryStatusRepository.markConversationRead(conversationId, userId);
        }

        return messageRepository.countUnread(conversationId, userId);
    }


    public List<User> getConversationParticipants(Long conversationId, String conversationType) {
        if ("group".equalsIgnoreCase(conversationType)) {
            return groupConversationRepository.findById(conversationId)
                    .map(GroupConversation::getParticipants)
                    .orElse(new ArrayList<>());
        } else if ("private".equalsIgnoreCase(conversationType)) {
            return privateConversationRepository.findById(conversationId)
                    .map(PrivateConversation::getParticipants)
                    .orElse(new ArrayList<>());
        }
        throw new IllegalArgumentException("Invalid conversation type");
    }



    public Message saveMessage(MessageDto messageDto, Conversation conversation, User sender, String conversationType) {
        String timestampStr = java.time.LocalDateTime.now()
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        Message message;
        if (messageDto.getMessageId() != null) {
            // Editing an existing message
            message = messageRepository.findById(messageDto.getMessageId())
                    .orElseThrow(() -> new IllegalArgumentException("Message not found"));
            message.setContent(messageDto.getContent());
            message.setTimestamp(Timestamp.valueOf(timestampStr));
        } else {
            // Creating a new message with conversationType
            message = new Message(messageDto, conversation, sender, timestampStr);
            message.setConversationType(conversationType);  // ✅ Ensure conversationType is set
        }
        return messageRepository.save(message);
    }

    @Transactional
    public MessageDto editMessageAndBroadcast(Long messageId, String newContent, String conversationType, Long loggedInUserId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        if (!message.getSender().getId().equals(loggedInUserId)) {
            throw new IllegalArgumentException("You can only edit your own messages.");
        }

        // Media bodies are URLs and a share's body is server-written, so only
        // words can be edited — see MessageKind.
        if (!MessageKind.of(message.getType()).isEditable()) {
            throw new IllegalArgumentException("Only text messages can be edited.");
        }
        if (Boolean.TRUE.equals(message.getReported())) {
            throw new ContentUnderReviewException();
        }

        message.setContent(contentSanitizer.mask(newContent));
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        message = messageRepository.save(message);

        MessageDto updatedMessageDto = new MessageDto(message);
        updatedMessageDto.setEdited(true);
        // Carried on every re-broadcast, or the client would take an edit as
        // "no reactions" and wipe the tallies it was showing.
        updatedMessageDto.setReactions(reactionService.summariesFor(messageId, null));
        List<String> destinations = getDestination(conversationType, updatedMessageDto);

        // ✅ Defer broadcasting
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (String destination : destinations) {
                    messagingTemplate.convertAndSend(destination, updatedMessageDto);
                }
            }
        });

        return updatedMessageDto;
    }


    public MessageDto deleteMessage(Long messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        MessageDto deletedMessageDto = new MessageDto(message); // ✅ Capture details before deletion
        messageRepository.delete(message); // ✅ Permanently delete message

        return deletedMessageDto;
    }

    @Transactional
    public MessageDto deleteMessageAndBroadcast(Long messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));

        MessageDto deletedMessageDto = new MessageDto(message);
        deletedMessageDto.setDeleted(true);

        boolean hasManagedMedia = MessageKind.of(message.getType()).hasMediaBody();
        String mediaContent = message.getContent();
        int metadataSeparator = mediaContent == null ? -1 : mediaContent.indexOf('|');
        String mediaUrl = metadataSeparator >= 0
                ? mediaContent.substring(0, metadataSeparator)
                : mediaContent;

        reactionService.removeAllFor(messageId);
        pollService.removeForMessage(messageId);
        messageRepository.delete(message);
        List<String> destinations = getDestination(message.getConversationType(), deletedMessageDto);

        // Broadcast only after the database delete commits.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (String destination : destinations) {
                    messagingTemplate.convertAndSend(destination, deletedMessageDto);
                }
            }
        });
        if (hasManagedMedia && mediaUrl != null && !mediaUrl.isBlank()) {
            ossCleanupService.deleteAfterCommit(mediaUrl);
        }

        return deletedMessageDto;
    }



    public Message getMessageById(Long messageId) {
        return messageRepository.findById(messageId)
                .orElseThrow(() -> new IllegalArgumentException("Message not found"));
    }
}
