package com.fyp.backend.service.assistant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.dto.ThreadDto;
import com.fyp.backend.model.User;
import com.fyp.backend.service.AnnouncementService;
import com.fyp.backend.service.AssistantAccountService;
import com.fyp.backend.service.CourseService;
import com.fyp.backend.service.EventService;
import com.fyp.backend.service.ThreadService;
import com.fyp.backend.service.bible.BibleService;

/**
 * Tool arguments are model output, and through prompt injection a group member can
 * influence them. These cover the two promises that keeps safe: every argument is
 * clamped, and nothing throws — a throw would reach the listener's retry advice and
 * turn one bad argument into several paid LLM calls.
 */
class AssistantToolRegistryTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private BibleService bibleService;
    private AnnouncementService announcementService;
    private EventService eventService;
    private CourseService courseService;
    private ThreadService threadService;
    private AssistantAccountService assistantAccountService;
    private AssistantToolRegistry tools;

    private static JsonNode args(String json) {
        try {
            return MAPPER.readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @BeforeEach
    void setUp() {
        bibleService = mock(BibleService.class);
        announcementService = mock(AnnouncementService.class);
        eventService = mock(EventService.class);
        courseService = mock(CourseService.class);
        threadService = mock(ThreadService.class);
        assistantAccountService = mock(AssistantAccountService.class);
        tools = new AssistantToolRegistry(bibleService, announcementService, eventService,
                courseService, threadService, assistantAccountService);

        when(eventService.getEvents(anyString(), any(), any(), any())).thenReturn(Page.empty());
        when(courseService.listPublishedCourses(any(), anyInt(), anyInt(), any(), any()))
                .thenReturn(Map.of("data", List.of()));
        when(announcementService.getAllAnnouncements()).thenReturn(List.of());
    }

    private int capturedEventPageSize() {
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(eventService).getEvents(anyString(), any(), any(), pageable.capture());
        return pageable.getValue().getPageSize();
    }

    @Test
    void anAbsurdLimitIsClampedRatherThanHonoured() {
        tools.execute("list_events", args("{\"limit\":10000}"));
        assertEquals(AssistantToolRegistry.MAX_ROWS, capturedEventPageSize());
    }

    @Test
    void aNegativeLimitNeverReachesPageRequest() {
        // PageRequest.of throws on a non-positive size, and that throw is exactly
        // what would become five paid retries.
        tools.execute("list_events", args("{\"limit\":-1}"));
        assertTrue(capturedEventPageSize() > 0);
    }

    @Test
    void aMissingOrUnparseableLimitFallsBackToADefault() {
        tools.execute("list_events", args("{\"limit\":\"lots\"}"));
        assertTrue(capturedEventPageSize() > 0);
    }

    @Test
    void anUnknownStatusFallsBackToUpcoming() {
        tools.execute("list_events", args("{\"status\":\"whenever\"}"));
        ArgumentCaptor<String> status = ArgumentCaptor.forClass(String.class);
        verify(eventService).getEvents(status.capture(), any(), any(), any());
        assertEquals("upcoming", status.getValue());
    }

    @Test
    void anOverlongQueryIsTruncated() {
        String query = "a".repeat(5000);
        when(bibleService.search(anyString(), anyString(), anyInt())).thenReturn(List.of());
        tools.execute("search_passages", args("{\"query\":\"" + query + "\"}"));

        ArgumentCaptor<String> sent = ArgumentCaptor.forClass(String.class);
        verify(bibleService).search(sent.capture(), anyString(), anyInt());
        assertEquals(AssistantToolRegistry.MAX_QUERY_CHARS, sent.getValue().length());
    }

    @Test
    void anUnknownToolIsAnAnswerNotAnException() {
        String result = tools.execute("drop_tables", args("{}"));
        assertTrue(result.contains("error"), result);
    }

    @Test
    void aFailingServiceIsSwallowedIntoAnErrorResult() {
        when(announcementService.getAllAnnouncements()).thenThrow(new RuntimeException("db down"));
        String result = tools.execute("list_announcements", args("{}"));
        assertTrue(result.contains("error"), result);
    }

    @Test
    void nullAndEmptyArgumentsDoNotThrow() {
        for (String name : List.of("lookup_passage", "search_passages", "list_announcements",
                "list_events", "list_courses", "list_threads")) {
            assertNotNull(tools.execute(name, null), name);
            assertNotNull(tools.execute(name, args("{}")), name);
        }
    }

    /** A blanked title means mapToDto hid a reported thread; the row must go entirely. */
    @Test
    void reportedThreadsAreDroppedNotListedWithoutATitle() {
        User assistant = new User();
        assistant.setId(7L);
        when(assistantAccountService.findAssistant()).thenReturn(Optional.of(assistant));

        ThreadDto visible = ThreadDto.builder().id(1L).title("Prayer meeting")
                .createdByName("A Member").createdAt(LocalDateTime.now()).build();
        ThreadDto reported = ThreadDto.builder().id(2L).title(null)
                .createdByName("A Member").createdAt(LocalDateTime.now()).build();
        when(threadService.getThreads(eq(0), anyInt(), eq(assistant)))
                .thenReturn(Map.of("data", List.of(visible, reported)));

        String result = tools.execute("list_threads", args("{}"));
        assertTrue(result.contains("Prayer meeting"));
        assertEquals(1, result.split("\"title\"", -1).length - 1, result);
    }

    @Test
    void announcementCoverPathsAreNeverExposed() {
        com.fyp.backend.model.Announcement announcement = new com.fyp.backend.model.Announcement(
                "Christmas service", "announcementPictures/secret-object-path.jpg", "https://example.org");
        when(announcementService.getAllAnnouncements()).thenReturn(List.of(announcement));

        String result = tools.execute("list_announcements", args("{}"));
        assertTrue(result.contains("Christmas service"));
        assertFalse(result.contains("announcementPictures"), result);
    }

    @Test
    void everyAdvertisedToolIsActuallyImplemented() {
        for (Map<String, Object> specification : tools.specifications()) {
            @SuppressWarnings("unchecked")
            Map<String, Object> function = (Map<String, Object>) specification.get("function");
            String name = String.valueOf(function.get("name"));
            assertFalse(tools.execute(name, args("{}")).contains("There is no tool called"), name);
        }
    }

    @Test
    void eventListingUsesTheSummaryDtoSoAttendanceCannotLeak() {
        // Guards the boundary rather than the mock: EventService.getEvents returns
        // EventSummaryDto, which has no checkedInUserIds to serialise.
        tools.execute("list_events", args("{}"));
        verify(eventService).getEvents(anyString(), eq((Instant) null), eq((Instant) null), any());
    }
}
