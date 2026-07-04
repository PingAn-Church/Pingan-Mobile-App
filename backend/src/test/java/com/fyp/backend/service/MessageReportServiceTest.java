package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
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

import com.fyp.backend.model.GroupConversation;
import com.fyp.backend.model.Message;
import com.fyp.backend.model.MessageReport;
import com.fyp.backend.model.User;
import com.fyp.backend.repository.MessageReportRepository;
import com.fyp.backend.repository.MessageRepository;
import com.fyp.backend.repository.UserRepository;

/**
 * Behaviour tests for message reporting. Pure unit tests — repositories and
 * collaborating services are mocked. The invariants: one report per message
 * (ever), no self-reporting, snapshots survive message deletion, and resolve
 * actions run exactly once per report.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MessageReportServiceTest {

    @Mock private MessageReportRepository messageReportRepository;
    @Mock private MessageRepository messageRepository;
    @Mock private UserRepository userRepository;
    @Mock private UserService userService;
    @Mock private ChatService chatService;

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

    // ---- creating reports --------------------------------------------------

    @Test
    void createSnapshotsMessageDetails() {
        User sender = user(1, "Bad", "Actor");
        User reporter = user(2, "Good", "Citizen");
        when(messageReportRepository.existsByMessageId(5L)).thenReturn(false);
        when(messageRepository.findById(5L)).thenReturn(Optional.of(message(5L, sender)));
        when(userRepository.findById(2L)).thenReturn(Optional.of(reporter));
        when(messageReportRepository.save(any(MessageReport.class))).thenAnswer(inv -> inv.getArgument(0));

        MessageReport report = service.createReport(5L, 2L);

        assertEquals(5L, report.getMessageId());
        assertEquals(42L, report.getConversationId());
        assertEquals("text", report.getMessageType());
        assertEquals("offensive text", report.getMessageContent());
        assertEquals(1L, report.getSenderId());
        assertEquals("Bad Actor", report.getSenderName());
        assertEquals(2L, report.getReporterId());
        assertEquals("Good Citizen", report.getReporterName());
        assertEquals(MessageReport.STATUS_PENDING, report.getStatus());
    }

    @Test
    void createRejectsDuplicateReport() {
        when(messageReportRepository.existsByMessageId(5L)).thenReturn(true);

        assertThrows(IllegalStateException.class, () -> service.createReport(5L, 2L));
        verify(messageReportRepository, never()).save(any());
    }

    @Test
    void createRejectsOwnMessage() {
        User sender = user(2, "Self", "Reporter");
        when(messageReportRepository.existsByMessageId(5L)).thenReturn(false);
        when(messageRepository.findById(5L)).thenReturn(Optional.of(message(5L, sender)));

        assertThrows(IllegalArgumentException.class, () -> service.createReport(5L, 2L));
        verify(messageReportRepository, never()).save(any());
    }

    @Test
    void createRejectsMissingMessage() {
        when(messageReportRepository.existsByMessageId(5L)).thenReturn(false);
        when(messageRepository.findById(5L)).thenReturn(Optional.empty());

        assertThrows(IllegalArgumentException.class, () -> service.createReport(5L, 2L));
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

    private MessageReport pendingReport(long id) {
        MessageReport r = new MessageReport();
        r.setId(id);
        r.setMessageId(5L);
        r.setSenderId(1L);
        r.setStatus(MessageReport.STATUS_PENDING);
        r.setReportedAt(new Timestamp(System.currentTimeMillis()));
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
    void resolveNoProblemTouchesNothing() {
        when(messageReportRepository.findById(9L)).thenReturn(Optional.of(pendingReport(9L)));
        when(userRepository.findById(3L)).thenReturn(Optional.of(user(3, "Ad", "Min")));
        when(messageReportRepository.save(any(MessageReport.class))).thenAnswer(inv -> inv.getArgument(0));

        MessageReport resolved = service.resolveReport(9L, MessageReport.ACTION_NO_PROBLEM, 3L);

        verify(userService, never()).updateUserActiveStatus(any(), org.mockito.ArgumentMatchers.anyBoolean());
        verify(chatService, never()).deleteMessageAndBroadcast(any());
        assertEquals(MessageReport.ACTION_NO_PROBLEM, resolved.getResolution());
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
