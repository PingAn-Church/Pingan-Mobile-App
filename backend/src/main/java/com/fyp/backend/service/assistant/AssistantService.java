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
import com.fyp.backend.dto.MessageDto;
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

            Photos:
            - Photos shared in the chat are attached to their turns; "[photo]" marks one that
              could not be attached. You may describe a photo or answer questions about it.
            - Never identify, name, or guess at who a person in a photo is, and do not
              describe people's faces, bodies, or appearance. Talk about the event, the
              place, the text, the objects.

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
    private final AssistantImageLoader images;
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

            String generated = generate(trigger, conversationId, language);
            String reply = renderer.render(generated, language);
            if (reply == null || reply.isBlank()) {
                // The raw length separates the two ways this happens: nothing came
                // back from the model at all, or it came back as tokens that all
                // failed to resolve and were stripped.
                log.info("Nothing usable for message {} (model returned {} chars); "
                        + "sending the fallback.", triggerMessageId,
                        generated == null ? 0 : generated.length());
                reply = unsureMessage(language);
            }
            post(conversationId, triggerMessageId, askerId, assistant, reply);
            throttle.markAnswered(triggerMessageId);
        } catch (RuntimeException e) {
            if (lostTheRaceToAnswer(triggerMessageId, e)) {
                // Another worker got its reply in first. Its answer is already in
                // the group, so an apology here would be a second message about a
                // question that was answered fine.
                log.debug("Message {} was answered by another worker.", triggerMessageId);
                throttle.markAnswered(triggerMessageId);
            } else {
                log.warn("Assistant could not answer message {}: {}", triggerMessageId, e.toString(), e);
                failSoftly(conversationId, triggerMessageId, askerId);
            }
        } finally {
            throttle.releaseClaim(triggerMessageId);
        }
    }

    /**
     * Whether this failure really is the unique index refusing a second reply.
     *
     * The exception type alone is not enough to say so. Every constraint failure on
     * this insert arrives as a DataIntegrityViolationException — or, once the
     * transaction is marked rollback-only, as an UnexpectedRollbackException at
     * commit — so classifying on type quietly filed "the value is too long for this
     * column" as a harmless race and left the group with no reply and no log line.
     *
     * So the question is answered by looking: a reply either exists now or it does
     * not. If it does, another worker won and silence is right. If it does not,
     * something is actually broken and it gets a warning and a stack trace.
     */
    private boolean lostTheRaceToAnswer(Long triggerMessageId, Throwable failure) {
        boolean constraintFailure = false;
        for (Throwable current = failure; current != null; current = current.getCause()) {
            if (current instanceof DataIntegrityViolationException
                    || current instanceof UnexpectedRollbackException) {
                constraintFailure = true;
                break;
            }
            if (current.getCause() == current) {
                break;
            }
        }
        if (!constraintFailure) {
            return false;
        }
        try {
            return messageRepository.existsByRespondsToMessageId(triggerMessageId);
        } catch (RuntimeException unavailable) {
            // Cannot tell, so assume the worse case and report it.
            return false;
        }
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

    /**
     * Posts the reply and says so.
     *
     * Both outcomes are logged at INFO on purpose. Without this, a reply that was
     * saved and a reply that was skipped as a duplicate produced exactly the same
     * output — nothing — so "the assistant said nothing in the group" could not be
     * told apart from "the assistant answered and the message did not arrive", which
     * are problems in completely different parts of the system.
     */
    private void post(Long conversationId, Long triggerMessageId, Long askerId,
                      User assistant, String content) {
        MessageDto posted = chatService.sendAssistantReply(conversationId, triggerMessageId,
                askerId, assistant, content);
        if (posted == null) {
            log.info("Message {} already had a reply; nothing posted.", triggerMessageId);
            return;
        }
        log.info("Assistant answered message {} in conversation {} as message {} ({} chars).",
                triggerMessageId, conversationId, posted.getMessageId(),
                content == null ? 0 : content.length());
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
     *
     * Photos travel with their turns, newest first up to the configured cap; each
     * photo message in the app is exactly one picture, so a burst of photos is a
     * run of turns and the cap bounds the request. Beyond it, and whenever a photo
     * cannot be fetched, the turn keeps the "[photo]" placeholder.
     */
    private List<Map<String, Object>> context(Message trigger, Long conversationId) {
        List<Message> earlier = messageRepository.findByConversationIdAndIdLessThanOrderByIdDesc(
                conversationId, trigger.getId(),
                PageRequest.of(0, Math.max(1, properties.getMaxContextMessages())));
        List<Message> ordered = new ArrayList<>(earlier);
        Collections.reverse(ordered);
        ordered.add(trigger);

        // Decided newest-first so the cap keeps the photos closest to the question,
        // then emitted oldest-first like every other turn.
        Map<Long, String> attached = new LinkedHashMap<>();
        if (properties.isImageInput()) {
            for (int i = ordered.size() - 1; i >= 0 && attached.size() < properties.getMaxImagesPerRequest(); i--) {
                Message message = ordered.get(i);
                if (isPhoto(message) && !Boolean.TRUE.equals(message.getReported())) {
                    images.dataUrl(message).ifPresent(url -> attached.put(message.getId(), url));
                }
            }
        }

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
            String role = fromAssistant ? "assistant" : "user";
            String photo = attached.get(message.getId());
            turns.add(photo == null ? message(role, body) : messageWithPhoto(role, body, photo));
        }
        return turns;
    }

    private static boolean isPhoto(Message message) {
        return message.getType() != null && "image".equalsIgnoreCase(message.getType());
    }

    /**
     * Media becomes a placeholder. The stored value is an OSS object path, which
     * means nothing to a model and would leak the storage layout; a photo that is
     * shown to the model is attached alongside this text, never in place of it.
     */
    private static String readable(Message message) {
        String type = message.getType() == null ? "text" : message.getType().toLowerCase(Locale.ROOT);
        return switch (type) {
            case "image" -> "[photo]";
            case "voice" -> "[voice message]";
            // The body is the server-written "📅 Title · date time · place" line;
            // labelled so the model knows it is a shared card, not someone's words.
            case "event" -> "[shared event] " + (message.getContent() == null ? ""
                    : message.getContent().replaceFirst("^📅\\s*", ""));
            default -> message.getContent() == null ? "" : message.getContent();
        };
    }

    private static Map<String, Object> message(String role, String content) {
        Map<String, Object> turn = new LinkedHashMap<>();
        turn.put("role", role);
        turn.put("content", content);
        return turn;
    }

    /**
     * A turn in the provider's multi-part form: the text, then the picture as an
     * inline {@code data:} URL. This is the chat-completions vision shape that
     * OpenAI and the compatible providers share.
     */
    private Map<String, Object> messageWithPhoto(String role, String text, String dataUrl) {
        Map<String, Object> textPart = new LinkedHashMap<>();
        textPart.put("type", "text");
        textPart.put("text", text);

        Map<String, Object> image = new LinkedHashMap<>();
        image.put("url", dataUrl);
        String detail = properties.getImageDetail();
        if (detail != null && !detail.isBlank() && !"auto".equalsIgnoreCase(detail)) {
            image.put("detail", detail.trim().toLowerCase(Locale.ROOT));
        }
        Map<String, Object> imagePart = new LinkedHashMap<>();
        imagePart.put("type", "image_url");
        imagePart.put("image_url", image);

        Map<String, Object> turn = new LinkedHashMap<>();
        turn.put("role", role);
        turn.put("content", List.of(textPart, imagePart));
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
