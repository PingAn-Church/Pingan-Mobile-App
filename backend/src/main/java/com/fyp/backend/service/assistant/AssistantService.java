package com.fyp.backend.service.assistant;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.UnexpectedRollbackException;

import com.fyp.backend.config.app.AssistantProperties;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.AssistantAccountService;
import com.fyp.backend.service.ChatService;

import lombok.RequiredArgsConstructor;

/**
 * Answers a mention of the assistant.
 *
 * Runs on a worker rather than in the request: a call with a tool round trip takes
 * seconds, and holding a Tomcat thread for it would make the sender's send button
 * spin on a third party's availability.
 *
 * Everything here is written to be safe to run twice. The task carries ids only and
 * the rows are re-read, so a redelivery reproduces the same inputs; the context is
 * anchored at the message that summoned the assistant rather than at "the newest
 * messages now", so it reproduces the same answer; and the insert is guarded by a
 * unique index, so only one reply can ever land.
 */
@Service
@RequiredArgsConstructor
public class AssistantService {

    private static final Logger log = LoggerFactory.getLogger(AssistantService.class);

    /**
     * Draft — pending review by church leadership before this goes live.
     * See docs/assistant-integration-plan.md §10.
     */
    static final String SYSTEM_PROMPT = """
            You are ShalomBot (平安小助手), an assistant inside the Pingan Church mobile app.
            You are speaking in a group chat where every member can read your reply.

            Scripture:
            - NEVER write out Bible text yourself, in any language, even if you are sure of it.
              To quote scripture, emit a token: [bible:TRANSLATION:BOOK:CHAPTER:VERSE]
              e.g. [bible:CUV:42:10:27] or a range [bible:KJV:42:10:25-37].
              The app replaces these with the exact wording. A token is the ONLY way to quote.
            - The token is a machine code, not text for the reader. It is ALWAYS written this
              exact way whatever language you are replying in: plain ASCII, colons as ":",
              and BOOK as the NUMBER the tools gave you — never a book name, in any language.
              [bible:CUV:42:15:11-32] is right even in a Chinese reply.
              [路加福音15：11-32] and [Luke 15:11-32] are both wrong and will not work.
            - Every tool result hands you a ready-made `quote_token`. Copy it verbatim.
            - Look a passage up with your tools before referring to it. Never cite a reference
              you have not looked up.
            - Do not put a reference in square brackets. If you want to name a passage without
              quoting it, write it as ordinary prose — 路加福音 15:11-32 — with no brackets.
            - At most 6 tokens per reply, and no range longer than 15 verses.

            Tone and doctrine:
            - Answer in a manner consistent with Baptist teaching.
            - Do not pass judgement on any person, their conduct, or their standing before God.
            - Where a question invites judgement, return to what Scripture says and leave the
              application to the reader and their church.
            - Where believers in good faith hold differing views, say so plainly rather than
              presenting one as settled.

            Boundaries:
            - For grief, crisis, mental health, abuse, or anything pastoral, respond briefly with
              care and direct the person to a pastor or church leader. Do not counsel.
            - For app questions (events, courses, discussion topics, announcements), use your
              tools and refer to an event by its token, e.g. [event:42]. Never write a date,
              time, or place yourself.
            - If your tools return nothing relevant, say you do not know.

            Style:
            - Reply in the language the question was asked in.
            - Be brief — a few sentences. This is a chat, not an essay.
            """;

    private final AssistantProperties properties;
    private final AssistantClient client;
    private final AssistantToolRegistry tools;
    private final AssistantReplyRenderer renderer;
    private final AssistantThrottle throttle;
    private final AssistantAccountService assistantAccountService;
    private final ChatService chatService;
    private final MessageRepository messageRepository;
    private final GroupConversationRepository groupConversationRepository;
    private final UserRepository userRepository;

    /**
     * Produces at most one reply to one triggering message.
     *
     * Never throws. An exception escaping into the listener would be retried, and a
     * retry after a partial success is how the same question gets answered twice.
     */
    public void answer(Long conversationId, Long triggerMessageId, Long askerId) {
        if (conversationId == null || triggerMessageId == null || !client.isAvailable()) {
            return;
        }
        if (throttle.alreadyAnswered(triggerMessageId)) {
            return;
        }
        if (!throttle.claim(triggerMessageId)) {
            log.debug("Another worker is already answering message {}.", triggerMessageId);
            return;
        }

        try {
            Message trigger = messageRepository.findById(triggerMessageId).orElse(null);
            if (trigger == null) {
                // Deleting a message is a hard delete, so the question can be gone
                // before the worker runs. Answering it now would be answering nothing.
                log.debug("Message {} no longer exists; nothing to answer.", triggerMessageId);
                return;
            }
            GroupConversation group = groupConversationRepository.findById(conversationId).orElse(null);
            if (group == null || !group.isAssistantEnabled()) {
                return;
            }
            User assistant = assistantAccountService.findAssistant().orElse(null);
            if (assistant == null) {
                log.warn("The assistant account is missing; cannot answer message {}.", triggerMessageId);
                return;
            }

            String language = languageOf(askerId);
            if (!throttle.withinLimits(askerId, conversationId)) {
                if (throttle.shouldAnnounceLimit(askerId)) {
                    post(conversationId, triggerMessageId, askerId, assistant, busyMessage(language));
                }
                // Marked answered either way: the request is spent, and a redelivery
                // must not spend another.
                throttle.markAnswered(triggerMessageId);
                return;
            }

            String reply = renderer.render(generate(trigger, conversationId, language), language);
            if (reply == null || reply.isBlank()) {
                reply = unsureMessage(language);
            }
            post(conversationId, triggerMessageId, askerId, assistant, reply);
            throttle.markAnswered(triggerMessageId);
        } catch (RuntimeException e) {
            if (lostTheRaceToAnswer(e)) {
                // Another worker got its reply in first. Its answer is already in
                // the group, so an apology here would be a second message about a
                // question that was answered fine.
                log.debug("Message {} was answered by another worker.", triggerMessageId);
                throttle.markAnswered(triggerMessageId);
            } else {
                log.warn("Assistant could not answer message {}: {}", triggerMessageId, e.toString());
                failSoftly(conversationId, triggerMessageId, askerId);
            }
        } finally {
            throttle.releaseClaim(triggerMessageId);
        }
    }

    /**
     * Whether this failure is the unique index refusing a second reply.
     *
     * The violation may surface directly, or as the UnexpectedRollbackException
     * thrown at commit once the transaction has been marked rollback-only, so both
     * are checked, and through the cause chain because Spring wraps them.
     */
    private static boolean lostTheRaceToAnswer(Throwable failure) {
        for (Throwable current = failure; current != null; current = current.getCause()) {
            if (current instanceof DataIntegrityViolationException
                    || current instanceof UnexpectedRollbackException) {
                return true;
            }
            if (current.getCause() == current) {
                break;
            }
        }
        return false;
    }

    /**
     * A visible apology beats silence when somebody is waiting on an answer, but it
     * still counts as having replied so a redelivery does not try again.
     */
    private void failSoftly(Long conversationId, Long triggerMessageId, Long askerId) {
        try {
            User assistant = assistantAccountService.findAssistant().orElse(null);
            if (assistant != null) {
                post(conversationId, triggerMessageId, askerId, assistant,
                        unavailableMessage(languageOf(askerId)));
            }
            throttle.markAnswered(triggerMessageId);
        } catch (RuntimeException nested) {
            log.warn("Assistant fallback reply also failed: {}", nested.toString());
        }
    }

    private void post(Long conversationId, Long triggerMessageId, Long askerId,
                      User assistant, String content) {
        if (chatService.sendAssistantReply(conversationId, triggerMessageId, askerId,
                assistant, content) == null) {
            log.debug("Message {} had already been answered; duplicate discarded.", triggerMessageId);
        }
    }

    private String generate(Message trigger, Long conversationId, String language) {
        List<Map<String, Object>> conversation = new ArrayList<>();
        conversation.add(message("system", SYSTEM_PROMPT
                + "\nThe person asking reads " + (isChinese(language) ? "Chinese." : "English.")));
        conversation.addAll(context(trigger, conversationId));
        return client.complete(conversation, tools);
    }

    /**
     * The conversation as it stood when the assistant was called.
     *
     * Anchored at the triggering message, NOT at the newest messages when the worker
     * runs: by then the group may have moved on, and on a redelivery it may have
     * moved on by hours. Anchoring is what makes a retry produce the same answer.
     *
     * Names are stripped — every human turn is just its text — so the provider never
     * receives who-said-what from a church-wide conversation. Reported messages are
     * left out entirely: they are hidden from most members pending moderation, and
     * feeding them to the model would launder them back into view through the reply.
     */
    private List<Map<String, Object>> context(Message trigger, Long conversationId) {
        List<Message> earlier = messageRepository.findByConversationIdAndIdLessThanOrderByIdDesc(
                conversationId, trigger.getId(),
                PageRequest.of(0, Math.max(1, properties.getMaxContextMessages())));
        List<Message> ordered = new ArrayList<>(earlier);
        Collections.reverse(ordered);
        ordered.add(trigger);

        List<Map<String, Object>> turns = new ArrayList<>();
        for (Message message : ordered) {
            if (Boolean.TRUE.equals(message.getReported())) {
                continue;
            }
            String body = readable(message);
            if (body.isBlank()) {
                continue;
            }
            boolean fromAssistant = message.getSender() != null && message.getSender().isBot();
            turns.add(message(fromAssistant ? "assistant" : "user", body));
        }
        return turns;
    }

    /**
     * Media becomes a placeholder. The stored value is an OSS object path, which
     * means nothing to a model and would leak the storage layout.
     */
    private static String readable(Message message) {
        String type = message.getType() == null ? "text" : message.getType().toLowerCase(Locale.ROOT);
        return switch (type) {
            case "image" -> "[photo]";
            case "voice" -> "[voice message]";
            default -> message.getContent() == null ? "" : message.getContent();
        };
    }

    private static Map<String, Object> message(String role, String content) {
        Map<String, Object> turn = new LinkedHashMap<>();
        turn.put("role", role);
        turn.put("content", content);
        return turn;
    }

    private String languageOf(Long userId) {
        if (userId == null) {
            return "en";
        }
        return userRepository.findById(userId).map(User::getLanguage).orElse("en");
    }

    private static boolean isChinese(String language) {
        return language != null && language.toLowerCase(Locale.ROOT).startsWith("zh");
    }

    private static String busyMessage(String language) {
        return isChinese(language)
                ? "我暂时需要休息一下，请稍后再问我。"
                : "I need a short break — please ask me again a little later.";
    }

    private static String unavailableMessage(String language) {
        return isChinese(language)
                ? "抱歉，我现在无法回答，请稍后再试。"
                : "Sorry — I couldn't answer that just now. Please try again shortly.";
    }

    private static String unsureMessage(String language) {
        return isChinese(language)
                ? "抱歉，我不太确定这个问题的答案。"
                : "Sorry — I'm not sure about that one.";
    }
}
