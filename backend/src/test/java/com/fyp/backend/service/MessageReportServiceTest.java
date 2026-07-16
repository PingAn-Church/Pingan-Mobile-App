package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import com.fyp.backend.model.CourseRating;
import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageReport;
import com.fyp.backend.model.Thread;
import com.fyp.backend.model.ThreadReply;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.CourseRatingRepository;
import com.fyp.backend.repository.MessageReportRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.ThreadReplyRepository;
import com.fyp.backend.repository.ThreadRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Behaviour tests for content reporting (chat messages, forum threads/replies,
 * course reviews). Pure unit tests — repositories and collaborating services
 * are mocked. The invariants: one report per content item (ever), no
 * self-reporting, snapshots survive content deletion, reporting shadow-hides
 * the content, and resolve actions run exactly once per report ("no problem"
 * restores visibility).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MessageReportServiceTest {

    @Mock private MessageReportRepository messageReportRepository;
    @Mock private MessageRepository messageRepository;
    @Mock private ThreadRepository threadRepository;
    @Mock private ThreadReplyRepository threadReplyRepository;
    @Mock private CourseRatingRepository courseRatingRepository;
    @Mock private UserRepository userRepository;
    @Mock private UserService userService;
    @Mock private ChatService chatService;
    @Mock private ReviewService reviewService;

    @InjectMocks private MessageReportService service;

    private User user(long id, String first, String last) {
        User u = new User();
        u.setId(id);
        u.setFirstName(first);
        u.setLastName(last);
        u.setEmail(first.toLowerCase() + "@example.com");
        return u;
    }

    private Message message(long id, User sender) {
        Message m = new Message();
        m.setId(id);
        m.setSender(sender);
        m.setType("text");
        m.setContent("offensive text");
        m.setConversationType("group");
        GroupConversation g = new GroupConversation();
        g.setId(42L);
        m.setConversation(g);
        return m;
    }

    private Thread thread(long id, User author) {
        return Thread.builder()
                .id(id)
                .title("Bad title")
                .content("Bad body")
                .createdBy(author)
                .build();
    }

    private ThreadReply reply(long id, User author) {
        return ThreadReply.builder()
                .id(id)
                .content("Bad reply")
                .author(author)
                .build();
    }

    private CourseRating rating(long id, long userId, long courseId) {
        CourseRating r = new CourseRating();
        r.setId(id);
        r.setUserId(userId);
        r.setCourseId(courseId);
        r.setRating(1);
        r.setReview("Bad review");
        return r;
    }

    private void stubReporter() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(user(2, "Good", "Citizen")));
        when(messageReportRepository.save(any(MessageReport.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    // ---- creating reports --------------------------------------------------

    @Test
    void createSnapshotsMessageDetailsAndFlagsMessage() {
        User sender = user(1, "Bad", "Actor");
        Message message = message(5L, sender);
        when(messageRepository.findById(5L)).thenReturn(Optional.of(message));
        stubReporter();

        MessageReport report = service.createReport(5L, 2L);

        assertEquals(MessageReport.TYPE_MESSAGE, report.getContentType());
        assertEquals(5L, report.getContentId());
        assertEquals(42L, report.getConversationId());
        assertEquals("text", report.getMessageType());
        assertEquals("offensive text", report.getMessageContent());
        assertEquals(1L, report.getSenderId());
        assertEquals("Bad Actor", report.getSenderName());
        assertEquals(2L, report.getReporterId());
        assertEquals("Good Citizen", report.getReporterName());
        assertEquals(MessageReport.STATUS_PENDING, report.getStatus());
        assertTrue(Boolean.TRUE.equals(message.getReported()));
        verify(messageRepository).save(message);
    }

    @Test
    void createThreadReportSnapshotsAndFlagsThread() {
        Thread thread = thread(7L, user(1, "Bad", "Actor"));
        when(threadRepository.findById(7L)).thenReturn(Optional.of(thread));
        stubReporter();

        MessageReport report = service.createReport(MessageReport.TYPE_THREAD, 7L, 2L);

        assertEquals(MessageReport.TYPE_THREAD, report.getContentType());
        assertEquals(7L, report.getContentId());
        assertEquals("Bad title\n\nBad body", report.getMessageContent());
        assertEquals("text", report.getMessageType());
        assertEquals(1L, report.getSenderId());
        assertTrue(Boolean.TRUE.equals(thread.getReported()));
        verify(threadRepository).save(thread);
    }

    @Test
    void createReplyReportFlagsReply() {
        ThreadReply reply = reply(8L, user(1, "Bad", "Actor"));
        when(threadReplyRepository.findById(8L)).thenReturn(Optional.of(reply));
        stubReporter();

        MessageReport report = service.createReport(MessageReport.TYPE_THREAD_REPLY, 8L, 2L);

        assertEquals("Bad reply", report.getMessageContent());
        assertTrue(Boolean.TRUE.equals(reply.getReported()));
        verify(threadReplyRepository).save(reply);
    }

    @Test
    void createReviewReportFlagsReviewAndRecomputesRating() {
        CourseRating rating = rating(9L, 1L, 33L);
        when(courseRatingRepository.findById(9L)).thenReturn(Optional.of(rating));
        when(userRepository.findById(1L)).thenReturn(Optional.of(user(1, "Bad", "Actor")));
        stubReporter();

        MessageReport report = service.createReport(MessageReport.TYPE_COURSE_REVIEW, 9L, 2L);

        assertEquals("flagged", rating.getReviewStatus());
        assertEquals("1/5 - Bad review", report.getMessageContent());
        verify(courseRatingRepository).save(rating);
        verify(reviewService).recomputeCourseRating(33L);
    }

    @Test
    void createRejectsDuplicateReport() {
        when(messageReportRepository.existsByContentTypeAndContentId(MessageReport.TYPE_MESSAGE, 5L))
                .thenReturn(true);

        assertThrows(IllegalStateException.class, () -> service.createReport(5L, 2L));
        verify(messageReportRepository, never()).save(any());
    }

    @Test
    void createRejectsDuplicateLegacyReport() {
        when(messageReportRepository.existsByContentTypeAndContentId(MessageReport.TYPE_MESSAGE, 5L))
                .thenReturn(false);
        when(messageReportRepository.existsByContentTypeIsNullAndContentId(5L)).thenReturn(true);

        assertThrows(IllegalStateException.class, () -> service.createReport(5L, 2L));
        verify(messageReportRepository, never()).save(any());
    }

    @Test
    void createRejectsOwnContent() {
        User sender = user(2, "Self", "Reporter");
        when(messageRepository.findById(5L)).thenReturn(Optional.of(message(5L, sender)));

        assertThrows(IllegalArgumentException.class, () -> service.createReport(5L, 2L));
        verify(messageReportRepository, never()).save(any());
    }

    @Test
    void createRejectsMissingContent() {
        when(messageRepository.findById(5L)).thenReturn(Optional.empty());

        assertThrows(IllegalArgumentException.class, () -> service.createReport(5L, 2L));
    }

    @Test
    void createRejectsUnknownContentType() {
        assertThrows(IllegalArgumentException.class,
                () -> service.createReport("PROFILE", 5L, 2L));
        verify(messageReportRepository, never()).save(any());
    }

    // ---- listing reports ---------------------------------------------------

    @Test
    void listReportsNormalizesStatusAndDelegatesFilters() {
        Timestamp from = Timestamp.valueOf("2026-07-01 00:00:00");
        Timestamp to = Timestamp.valueOf("2026-07-31 23:59:59");
        Pageable pageable = PageRequest.of(0, 20);
        Page<MessageReport> expected = new PageImpl<>(List.of(pendingReport(1L)), pageable, 1);
        when(messageReportRepository.findAll(any(Specification.class), eq(pageable))).thenReturn(expected);

        Page<MessageReport> actual = service.getReports("pending", from, to, pageable);

        assertEquals(expected, actual);
        verify(messageReportRepository).findAll(any(Specification.class), eq(pageable));
    }

    @Test
    void listReportsRejectsUnknownStatus() {
        Pageable pageable = PageRequest.of(0, 20);

        assertThrows(IllegalArgumentException.class,
                () -> service.getReports("ARCHIVED", null, null, pageable));
        verify(messageReportRepository, never()).findAll(any(Specification.class), any(Pageable.class));
    }

    @Test
    void listReportsRejectsInvertedDateRange() {
        Pageable pageable = PageRequest.of(0, 20);
        Timestamp from = Timestamp.valueOf("2026-08-01 00:00:00");
        Timestamp to = Timestamp.valueOf("2026-07-01 00:00:00");

        assertThrows(IllegalArgumentException.class,
                () -> service.getReports(MessageReport.STATUS_PENDING, from, to, pageable));
        verify(messageReportRepository, never()).findAll(any(Specification.class), any(Pageable.class));
    }

    // ---- resolving reports -------------------------------------------------

    /** contentType left NULL on purpose: legacy rows must resolve as messages. */
    private MessageReport pendingReport(long id) {
        MessageReport r = new MessageReport();
        r.setId(id);
        r.setContentType(null);
        r.setContentId(5L);
        r.setSenderId(1L);
        r.setStatus(MessageReport.STATUS_PENDING);
        r.setReportedAt(new Timestamp(System.currentTimeMillis()));
        return r;
    }

    private MessageReport pendingReport(long id, String contentType, long contentId) {
        MessageReport r = pendingReport(id);
        r.setContentType(contentType);
        r.setContentId(contentId);
        return r;
    }

    @Test
    void resolveDeactivateUserCallsUserService() {
        when(messageReportRepository.findById(9L)).thenReturn(Optional.of(pendingReport(9L)));
        when(userRepository.findById(3L)).thenReturn(Optional.of(user(3, "Ad", "Min")));
        when(messageReportRepository.save(any(MessageReport.class))).thenAnswer(inv -> inv.getArgument(0));

        MessageReport resolved = service.resolveReport(9L, MessageReport.ACTION_DEACTIVATE_USER, 3L);

        verify(userService).updateUserActiveStatus(1L, false);
        assertEquals(MessageReport.STATUS_RESOLVED, resolved.getStatus());
        assertEquals(MessageReport.ACTION_DEACTIVATE_USER, resolved.getResolution());
        assertEquals(3L, resolved.getResolvedById());
    }

    @Test
    void resolveDeleteMessageDeletesWhenStillPresent() {
        when(messageReportRepository.findById(9L)).thenReturn(Optional.of(pendingReport(9L)));
        when(messageRepository.existsById(5L)).thenReturn(true);
        when(userRepository.findById(3L)).thenReturn(Optional.of(user(3, "Ad", "Min")));
        when(messageReportRepository.save(any(MessageReport.class))).thenAnswer(inv -> inv.getArgument(0));

        service.resolveReport(9L, MessageReport.ACTION_DELETE_MESSAGE, 3L);

        verify(chatService).deleteMessageAndBroadcast(5L);
    }

    @Test
    void resolveDeleteMessageSkipsWhenAlreadyGone() {
        when(messageReportRepository.findById(9L)).thenReturn(Optional.of(pendingReport(9L)));
        when(messageRepository.existsById(5L)).thenReturn(false);
        when(userRepository.findById(3L)).thenReturn(Optional.of(user(3, "Ad", "Min")));
        when(messageReportRepository.save(any(MessageReport.class))).thenAnswer(inv -> inv.getArgument(0));

        MessageReport resolved = service.resolveReport(9L, MessageReport.ACTION_DELETE_MESSAGE, 3L);

        verify(chatService, never()).deleteMessageAndBroadcast(any());
        assertEquals(MessageReport.STATUS_RESOLVED, resolved.getStatus());
    }

    @Test
    void resolveDeleteThreadDeletesThread() {
        when(messageReportRepository.findById(9L))
                .thenReturn(Optional.of(pendingReport(9L, MessageReport.TYPE_THREAD, 7L)));
        when(threadRepository.existsById(7L)).thenReturn(true);
        when(userRepository.findById(3L)).thenReturn(Optional.of(user(3, "Ad", "Min")));
        when(messageReportRepository.save(any(MessageReport.class))).thenAnswer(inv -> inv.getArgument(0));

        service.resolveReport(9L, MessageReport.ACTION_DELETE_MESSAGE, 3L);

        verify(threadRepository).deleteById(7L);
    }

    @Test
    void resolveDeleteReviewDeletesAndRecomputesRating() {
        when(messageReportRepository.findById(9L))
                .thenReturn(Optional.of(pendingReport(9L, MessageReport.TYPE_COURSE_REVIEW, 11L)));
        CourseRating rating = rating(11L, 1L, 33L);
        when(courseRatingRepository.findById(11L)).thenReturn(Optional.of(rating));
        when(userRepository.findById(3L)).thenReturn(Optional.of(user(3, "Ad", "Min")));
        when(messageReportRepository.save(any(MessageReport.class))).thenAnswer(inv -> inv.getArgument(0));

        service.resolveReport(9L, MessageReport.ACTION_DELETE_MESSAGE, 3L);

        verify(courseRatingRepository).delete(rating);
        verify(reviewService).recomputeCourseRating(33L);
    }

    @Test
    void resolveNoProblemClearsMessageFlag() {
        when(messageReportRepository.findById(9L)).thenReturn(Optional.of(pendingReport(9L)));
        Message message = message(5L, user(1, "Bad", "Actor"));
        message.setReported(true);
        when(messageRepository.findById(5L)).thenReturn(Optional.of(message));
        when(userRepository.findById(3L)).thenReturn(Optional.of(user(3, "Ad", "Min")));
        when(messageReportRepository.save(any(MessageReport.class))).thenAnswer(inv -> inv.getArgument(0));

        MessageReport resolved = service.resolveReport(9L, MessageReport.ACTION_NO_PROBLEM, 3L);

        verify(userService, never()).updateUserActiveStatus(any(), org.mockito.ArgumentMatchers.anyBoolean());
        verify(chatService, never()).deleteMessageAndBroadcast(any());
        assertFalse(Boolean.TRUE.equals(message.getReported()));
        verify(messageRepository).save(message);
        assertEquals(MessageReport.ACTION_NO_PROBLEM, resolved.getResolution());
    }

    @Test
    void resolveNoProblemRestoresFlaggedReview() {
        when(messageReportRepository.findById(9L))
                .thenReturn(Optional.of(pendingReport(9L, MessageReport.TYPE_COURSE_REVIEW, 11L)));
        CourseRating rating = rating(11L, 1L, 33L);
        rating.setReviewStatus("flagged");
        when(courseRatingRepository.findById(11L)).thenReturn(Optional.of(rating));
        when(userRepository.findById(3L)).thenReturn(Optional.of(user(3, "Ad", "Min")));
        when(messageReportRepository.save(any(MessageReport.class))).thenAnswer(inv -> inv.getArgument(0));

        service.resolveReport(9L, MessageReport.ACTION_NO_PROBLEM, 3L);

        assertEquals("visible", rating.getReviewStatus());
        verify(courseRatingRepository).save(rating);
        verify(reviewService).recomputeCourseRating(33L);
    }

    @Test
    void resolveRejectsAlreadyResolvedReport() {
        MessageReport resolved = pendingReport(9L);
        resolved.setStatus(MessageReport.STATUS_RESOLVED);
        when(messageReportRepository.findById(9L)).thenReturn(Optional.of(resolved));

        assertThrows(IllegalStateException.class,
                () -> service.resolveReport(9L, MessageReport.ACTION_NO_PROBLEM, 3L));
        verify(messageReportRepository, never()).save(any());
    }

    @Test
    void resolveRejectsUnknownAction() {
        when(messageReportRepository.findById(9L)).thenReturn(Optional.of(pendingReport(9L)));

        assertThrows(IllegalArgumentException.class, () -> service.resolveReport(9L, "NUKE_FROM_ORBIT", 3L));
        verify(messageReportRepository, never()).save(any());
    }
}
