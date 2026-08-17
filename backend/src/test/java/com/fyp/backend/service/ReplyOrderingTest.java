package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.PageRequest;

import com.fyp.backend.dto.ThreadReplyDto;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.model.User;
import com.fyp.backend.mq.FanoutPublisher;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserRepository;
import com.fyp.backend.util.JwtUtil;

/**
 * Current clients opt into newest-first/before. Requests without order preserve
 * the legacy oldest-first/after contract.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ReplyOrderingTest {

    @Mock private ThreadReplyRepository replyRepository;
    @Mock private ThreadRepository threadRepository;
    @Mock private UserRepository userRepository;
    @Mock private JwtUtil jwtUtil;
    @Mock private ModerationEventPublisher moderationEventPublisher;
    @Mock private ContentSanitizer contentSanitizer;
    @Mock private TopicSubscriptionService topicSubscriptionService;
    @Mock private FanoutPublisher fanoutPublisher;
    @Mock private PushMessages pushMessages;
    @Mock private ThreadContentCleanupService threadContentCleanupService;

    @InjectMocks private ThreadReplyService threadReplyService;

    private User viewer() {
        User u = new User();
        u.setId(1L);
        u.setEmail("viewer@example.com");
        u.setFirstName("View");
        u.setLastName("Er");
        return u;
    }

    private ThreadReply reply(long id) {
        Thread thread = new Thread();
        thread.setId(7L);

        ThreadReply r = new ThreadReply();
        r.setId(id);
        r.setContent("reply " + id);
        r.setCreatedAt(LocalDateTime.now());
        r.setAuthor(viewer());
        r.setThread(thread);
        return r;
    }

    private void authenticated() {
        when(jwtUtil.extractEmail("t")).thenReturn("viewer@example.com");
        when(userRepository.findByEmail("viewer@example.com")).thenReturn(Optional.of(viewer()));
    }

    @SuppressWarnings("unchecked")
    private List<ThreadReplyDto> items(Map<String, Object> page) {
        return (List<ThreadReplyDto>) page.get("data");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> pagination(Map<String, Object> page) {
        return (Map<String, Object>) page.get("pagination");
    }

    private Map<String, Object> newest(Long before, int size) {
        return threadReplyService.getRepliesPage(
                7L, before, null, size, "newest", "Bearer t");
    }

    private Map<String, Object> legacy(Long after, int size) {
        return threadReplyService.getRepliesPage(
                7L, null, after, size, null, "Bearer t");
    }

    @Test
    void theFirstPageIsTheNewestRepliesNewestFirst() {
        authenticated();
        when(replyRepository.findByThreadIdOrderByIdDesc(7L, PageRequest.of(0, 21)))
                .thenReturn(List.of(reply(30L), reply(29L), reply(28L)));

        Map<String, Object> page = newest(null, 20);

        assertEquals(List.of(30L, 29L, 28L), items(page).stream().map(ThreadReplyDto::getId).toList());
        // The cursor is the last id of the page — the oldest one held — so the next
        // page continues backwards from there.
        assertEquals(28L, pagination(page).get("nextCursor"));
        assertFalse((Boolean) pagination(page).get("hasMore"));
    }

    @Test
    void pagingWalksBackwardsIntoOlderReplies() {
        authenticated();
        when(replyRepository.findByThreadIdAndIdLessThanOrderByIdDesc(7L, 28L, PageRequest.of(0, 21)))
                .thenReturn(List.of(reply(27L), reply(26L)));

        Map<String, Object> page = newest(28L, 20);

        assertEquals(List.of(27L, 26L), items(page).stream().map(ThreadReplyDto::getId).toList());
        assertEquals(26L, pagination(page).get("nextCursor"));
    }

    @Test
    void hasMoreIsReportedWithoutLeakingTheExtraRowFetchedToDetectIt() {
        authenticated();
        // size + 1 is fetched purely to answer "is there another page".
        when(replyRepository.findByThreadIdOrderByIdDesc(7L, PageRequest.of(0, 3)))
                .thenReturn(List.of(reply(30L), reply(29L), reply(28L)));

        Map<String, Object> page = newest(null, 2);

        assertEquals(2, items(page).size());
        assertTrue((Boolean) pagination(page).get("hasMore"));
        assertEquals(29L, pagination(page).get("nextCursor"));
    }

    @Test
    void anExhaustedThreadKeepsTheCursorItWasGiven() {
        authenticated();
        when(replyRepository.findByThreadIdAndIdLessThanOrderByIdDesc(7L, 5L, PageRequest.of(0, 21)))
                .thenReturn(List.of());

        Map<String, Object> page = newest(5L, 20);

        assertTrue(items(page).isEmpty());
        assertEquals(5L, pagination(page).get("nextCursor"));
        assertFalse((Boolean) pagination(page).get("hasMore"));
    }

    @Test
    void legacyFirstPageRemainsOldestFirst() {
        authenticated();
        when(replyRepository.findByThreadIdOrderByIdAsc(7L, PageRequest.of(0, 21)))
                .thenReturn(List.of(reply(1L), reply(2L), reply(3L)));

        Map<String, Object> page = legacy(null, 20);

        assertEquals(List.of(1L, 2L, 3L), items(page).stream().map(ThreadReplyDto::getId).toList());
        assertEquals(3L, pagination(page).get("nextCursor"));
    }

    @Test
    void legacyAfterCursorWalksForwardIntoNewerReplies() {
        authenticated();
        when(replyRepository.findByThreadIdAndIdGreaterThanOrderByIdAsc(
                7L, 3L, PageRequest.of(0, 21)))
                .thenReturn(List.of(reply(4L), reply(5L)));

        Map<String, Object> page = legacy(3L, 20);

        assertEquals(List.of(4L, 5L), items(page).stream().map(ThreadReplyDto::getId).toList());
        assertEquals(5L, pagination(page).get("nextCursor"));
    }

    @Test
    void legacyServiceOverloadStillTreatsItsCursorAsAfter() {
        authenticated();
        when(replyRepository.findByThreadIdAndIdGreaterThanOrderByIdAsc(
                7L, 3L, PageRequest.of(0, 21)))
                .thenReturn(List.of(reply(4L)));

        Map<String, Object> page = threadReplyService.getRepliesPage(7L, 3L, 20, "Bearer t");

        assertEquals(List.of(4L), items(page).stream().map(ThreadReplyDto::getId).toList());
    }
}
