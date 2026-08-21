package com.fyp.backend.service.assistant;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Pageable;

import com.fyp.backend.config.app.AssistantProperties;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.GroupConversationRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.service.AssistantAccountService;
import com.fyp.backend.service.ChatService;

/**
 * The worker has to be safe to run twice and must never throw: a redelivery or an
 * in-process retry after a partial success is exactly how one question gets
 * answered twice, and an escaping exception is what triggers the retry.
 */
class AssistantServiceTest {

    private static final long CONVERSATION = 5L;
    private static final long TRIGGER = 900L;
    private static final long ASKER = 3L;

    private AssistantProperties properties;
    private AssistantClient client;
    private AssistantReplyRenderer renderer;
    private AssistantImageLoader images;
    private AssistantThrottle throttle;
    private AssistantAccountService accounts;
    private ChatService chatService;
    private MessageRepository messageRepository;
    private GroupConversationRepository groups;
    private UserRepository userRepository;
    private AssistantService assistant;

    private static User user(long id, boolean bot) {
        User user = new User();
        user.setId(id);
        user.setBot(bot);
        user.setFirstName(bot ? "ShalomBot" : "A");
        user.setLastName(bot ? "" : "Member");
        return user;
    }

    private static Message message(long id, User sender, String content) {
        Message message = new Message();
        message.setId(id);
        message.setSender(sender);
        message.setContent(content);
        message.setType("text");
        message.setTimestamp(new Timestamp(System.currentTimeMillis()));
        return message;
    }

    /** A photo message: the stored content is the upload's URL, as the app sends it. */
    private static Message photo(long id, User sender) {
        Message message = message(id, sender, "https://bucket.example/conversations/" + CONVERSATION
                + "/" + id + ".jpg");
        message.setType("image");
        return message;
    }

    @BeforeEach
    void setUp() {
        properties = new AssistantProperties();
        client = mock(AssistantClient.class);
        renderer = mock(AssistantReplyRenderer.class);
        images = mock(AssistantImageLoader.class);
        throttle = mock(AssistantThrottle.class);
        accounts = mock(AssistantAccountService.class);
        chatService = mock(ChatService.class);
        messageRepository = mock(MessageRepository.class);
        groups = mock(GroupConversationRepository.class);
        userRepository = mock(UserRepository.class);

        assistant = new AssistantService(properties, client,
                mock(AssistantToolRegistry.class), renderer, images, throttle, accounts, chatService,
                messageRepository, groups, userRepository);

        GroupConversation group = new GroupConversation();
        group.setId(CONVERSATION);
        group.setAssistantEnabled(true);

        // No photo is loadable unless a test says so; the placeholder path is the default.
        when(images.dataUrl(any())).thenReturn(Optional.empty());

        when(client.isAvailable()).thenReturn(true);
        when(throttle.alreadyAnswered(anyLong())).thenReturn(false);
        when(throttle.claim(anyLong())).thenReturn(true);
        when(throttle.withinLimits(any(), any())).thenReturn(true);
        when(groups.findById(CONVERSATION)).thenReturn(Optional.of(group));
        when(accounts.findAssistant()).thenReturn(Optional.of(user(99L, true)));
        when(userRepository.findById(ASKER)).thenReturn(Optional.of(user(ASKER, false)));
        when(messageRepository.findById(TRIGGER))
                .thenReturn(Optional.of(message(TRIGGER, user(ASKER, false), "@ShalomBot what is love?")));
        when(messageRepository.findByConversationIdAndIdLessThanOrderByIdDesc(anyLong(), anyLong(), any()))
                .thenReturn(List.of());
        when(client.complete(any(), any())).thenReturn("Some answer.");
        when(renderer.render(anyString(), any())).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void answersOnce() {
        assistant.answer(CONVERSATION, TRIGGER, ASKER);
        verify(chatService).sendAssistantReply(eq(CONVERSATION), eq(TRIGGER), eq(ASKER), any(),
                eq("Some answer."));
        verify(throttle).markAnswered(TRIGGER);
    }

    @Test
    void aRedeliveryOfAnAnsweredMessageDoesNothing() {
        when(throttle.alreadyAnswered(TRIGGER)).thenReturn(true);
        assistant.answer(CONVERSATION, TRIGGER, ASKER);
        verify(client, never()).complete(any(), any());
        verify(chatService, never()).sendAssistantReply(any(), any(), any(), any(), anyString());
    }

    @Test
    void aMessageAnotherWorkerHasClaimedIsLeftAlone() {
        when(throttle.claim(TRIGGER)).thenReturn(false);
        assistant.answer(CONVERSATION, TRIGGER, ASKER);
        verify(client, never()).complete(any(), any());
    }

    /** Deleting a message is a hard delete, so the question can vanish first. */
    @Test
    void aDeletedQuestionIsNotAnswered() {
        when(messageRepository.findById(TRIGGER)).thenReturn(Optional.empty());
        assistant.answer(CONVERSATION, TRIGGER, ASKER);
        verify(client, never()).complete(any(), any());
        verify(chatService, never()).sendAssistantReply(any(), any(), any(), any(), anyString());
    }

    @Test
    void aGroupThatHasTurnedTheAssistantOffIsNotAnswered() {
        GroupConversation off = new GroupConversation();
        off.setId(CONVERSATION);
        off.setAssistantEnabled(false);
        when(groups.findById(CONVERSATION)).thenReturn(Optional.of(off));

        assistant.answer(CONVERSATION, TRIGGER, ASKER);
        verify(client, never()).complete(any(), any());
    }

    /**
     * The listener runs with maxAttempts(1) precisely because a throw after a
     * partial success would post a second reply. Nothing may escape.
     */
    @Test
    void aProviderFailureBecomesAFallbackReplyNotAnException() {
        when(client.complete(any(), any())).thenThrow(new RuntimeException("provider down"));

        assertDoesNotThrow(() -> assistant.answer(CONVERSATION, TRIGGER, ASKER));

        ArgumentCaptor<String> posted = ArgumentCaptor.forClass(String.class);
        verify(chatService).sendAssistantReply(any(), any(), any(), any(), posted.capture());
        assertTrue(posted.getValue().toLowerCase().contains("couldn't answer"), posted.getValue());
        verify(throttle).markAnswered(TRIGGER);
    }

    @Test
    void theClaimIsAlwaysReleased() {
        when(client.complete(any(), any())).thenThrow(new RuntimeException("provider down"));
        assistant.answer(CONVERSATION, TRIGGER, ASKER);
        verify(throttle).releaseClaim(TRIGGER);
    }

    @Test
    void aRateLimitedRequestSaysSoOnceAndCostsNothing() {
        when(throttle.withinLimits(ASKER, CONVERSATION)).thenReturn(false);
        when(throttle.shouldAnnounceLimit(ASKER)).thenReturn(true);

        assistant.answer(CONVERSATION, TRIGGER, ASKER);

        verify(client, never()).complete(any(), any());
        verify(chatService, times(1)).sendAssistantReply(any(), any(), any(), any(), anyString());
        verify(throttle).markAnswered(TRIGGER);
    }

    @Test
    void aRepeatedlyRateLimitedRequestStaysSilent() {
        when(throttle.withinLimits(ASKER, CONVERSATION)).thenReturn(false);
        when(throttle.shouldAnnounceLimit(ASKER)).thenReturn(false);

        assistant.answer(CONVERSATION, TRIGGER, ASKER);

        verify(chatService, never()).sendAssistantReply(any(), any(), any(), any(), anyString());
        verify(throttle).markAnswered(TRIGGER);
    }

    /**
     * Context ends at the triggering message, not at whatever is newest when the
     * worker runs — otherwise a retry hours later answers a different conversation.
     */
    @Test
    void contextIsAnchoredAtTheTriggeringMessage() {
        assistant.answer(CONVERSATION, TRIGGER, ASKER);

        ArgumentCaptor<Long> before = ArgumentCaptor.forClass(Long.class);
        ArgumentCaptor<Pageable> page = ArgumentCaptor.forClass(Pageable.class);
        verify(messageRepository).findByConversationIdAndIdLessThanOrderByIdDesc(
                eq(CONVERSATION), before.capture(), page.capture());

        assertAll(
                () -> assertEquals(TRIGGER, before.getValue()),
                () -> assertTrue(page.getValue().getPageSize() > 0));
    }

    /** The messages handed to the provider on the last completion call. */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> sentConversation() {
        ArgumentCaptor<List<Map<String, Object>>> sent = ArgumentCaptor.forClass(List.class);
        verify(client).complete(sent.capture(), any());
        return sent.getValue();
    }

    @SuppressWarnings("unchecked")
    private static String imageUrlOf(Map<String, Object> turn) {
        Object content = turn.get("content");
        if (!(content instanceof List<?> parts)) {
            return null;
        }
        for (Object part : parts) {
            Map<String, Object> typed = (Map<String, Object>) part;
            if ("image_url".equals(typed.get("type"))) {
                return (String) ((Map<String, Object>) typed.get("image_url")).get("url");
            }
        }
        return null;
    }

    /**
     * A photo reaches the model as pixels next to its placeholder, never as the
     * storage URL that is what the row actually holds.
     */
    @Test
    void aPhotoInTheContextIsAttachedInlineAndItsStorageUrlIsNot() {
        Message picture = photo(890L, user(ASKER, false));
        when(messageRepository.findByConversationIdAndIdLessThanOrderByIdDesc(anyLong(), anyLong(), any()))
                .thenReturn(List.of(picture));
        when(images.dataUrl(picture)).thenReturn(Optional.of("data:image/jpeg;base64,AAAA"));

        assistant.answer(CONVERSATION, TRIGGER, ASKER);

        List<Map<String, Object>> sent = sentConversation();
        Map<String, Object> photoTurn = sent.get(1); // after the system prompt
        assertAll(
                () -> assertEquals("user", photoTurn.get("role")),
                () -> assertEquals("data:image/jpeg;base64,AAAA", imageUrlOf(photoTurn)),
                () -> assertTrue(sent.toString().contains("[photo]")),
                () -> assertTrue(!sent.toString().contains("bucket.example"), "storage URL leaked"));
    }

    /**
     * Several photos are several turns, each with its own picture — and the cap
     * keeps the ones nearest the question, dropping the oldest to placeholders.
     */
    @Test
    void aRunOfPhotosIsCappedNewestFirst() {
        properties.setMaxImagesPerRequest(2);
        Message oldest = photo(801L, user(ASKER, false));
        Message middle = photo(802L, user(ASKER, false));
        Message newest = photo(803L, user(ASKER, false));
        // Repository order is newest first, as the query name says.
        when(messageRepository.findByConversationIdAndIdLessThanOrderByIdDesc(anyLong(), anyLong(), any()))
                .thenReturn(List.of(newest, middle, oldest));
        when(images.dataUrl(any())).thenAnswer(call ->
                Optional.of("data:image/jpeg;base64," + ((Message) call.getArgument(0)).getId()));

        assistant.answer(CONVERSATION, TRIGGER, ASKER);

        List<Map<String, Object>> sent = sentConversation();
        assertAll(
                () -> assertEquals(null, imageUrlOf(sent.get(1)), "oldest should be a bare placeholder"),
                () -> assertEquals("[photo]", sent.get(1).get("content")),
                () -> assertEquals("data:image/jpeg;base64,802", imageUrlOf(sent.get(2))),
                () -> assertEquals("data:image/jpeg;base64,803", imageUrlOf(sent.get(3))));
        verify(images, never()).dataUrl(oldest);
    }

    /** Switched off — for a model without vision — nothing is fetched at all. */
    @Test
    void withImageInputOffPhotosStayPlaceholders() {
        properties.setImageInput(false);
        Message picture = photo(890L, user(ASKER, false));
        when(messageRepository.findByConversationIdAndIdLessThanOrderByIdDesc(anyLong(), anyLong(), any()))
                .thenReturn(List.of(picture));

        assistant.answer(CONVERSATION, TRIGGER, ASKER);

        assertEquals("[photo]", sentConversation().get(1).get("content"));
        verify(images, never()).dataUrl(any());
    }

    /** A photo that cannot be loaded must not cost the group its answer. */
    @Test
    void anUnloadablePhotoFallsBackToThePlaceholder() {
        Message picture = photo(890L, user(ASKER, false));
        when(messageRepository.findByConversationIdAndIdLessThanOrderByIdDesc(anyLong(), anyLong(), any()))
                .thenReturn(List.of(picture));
        when(images.dataUrl(picture)).thenReturn(Optional.empty());

        assistant.answer(CONVERSATION, TRIGGER, ASKER);

        assertEquals("[photo]", sentConversation().get(1).get("content"));
        verify(chatService).sendAssistantReply(eq(CONVERSATION), eq(TRIGGER), eq(ASKER), any(),
                eq("Some answer."));
    }

    /** Reported photos are hidden pending moderation; the model must not see them either. */
    @Test
    void aReportedPhotoIsNeitherFetchedNorMentioned() {
        Message picture = photo(890L, user(ASKER, false));
        picture.setReported(true);
        when(messageRepository.findByConversationIdAndIdLessThanOrderByIdDesc(anyLong(), anyLong(), any()))
                .thenReturn(List.of(picture));

        assistant.answer(CONVERSATION, TRIGGER, ASKER);

        verify(images, never()).dataUrl(any());
        assertEquals(2, sentConversation().size()); // system prompt + the question
    }

    @Test
    void anUnconfiguredProviderIsSilentRatherThanNoisy() {
        when(client.isAvailable()).thenReturn(false);
        assistant.answer(CONVERSATION, TRIGGER, ASKER);
        verify(throttle, never()).claim(anyLong());
        verify(chatService, never()).sendAssistantReply(any(), any(), any(), any(), anyString());
    }

    /**
     * A constraint failure is NOT proof that somebody else answered.
     *
     * Classifying on exception type alone filed "the value is too long for this
     * column" as a harmless race: the group got no reply, and the log got one debug
     * line nobody sees. The question has to be settled by looking for the reply.
     */
    @Test
    void aConstraintFailureWithNoReplyIsReportedAndApologisedFor() {
        when(chatService.sendAssistantReply(any(), any(), any(), any(), anyString()))
                .thenThrow(new DataIntegrityViolationException("value too long for varchar(255)"))
                .thenReturn(null);
        when(messageRepository.existsByRespondsToMessageId(TRIGGER)).thenReturn(false);

        assertDoesNotThrow(() -> assistant.answer(CONVERSATION, TRIGGER, ASKER));

        // Twice: the failed answer, then the fallback apology.
        verify(chatService, times(2)).sendAssistantReply(any(), any(), any(), any(), anyString());
    }

    /** A genuine race stays quiet — the other worker's answer is already there. */
    @Test
    void aConstraintFailureWithAReplyPresentStaysQuiet() {
        when(chatService.sendAssistantReply(any(), any(), any(), any(), anyString()))
                .thenThrow(new DataIntegrityViolationException("duplicate key"));
        when(messageRepository.existsByRespondsToMessageId(TRIGGER)).thenReturn(true);

        assistant.answer(CONVERSATION, TRIGGER, ASKER);

        verify(chatService, times(1)).sendAssistantReply(any(), any(), any(), any(), anyString());
        verify(throttle).markAnswered(TRIGGER);
    }
}
