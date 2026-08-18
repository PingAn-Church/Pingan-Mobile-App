package com.fyp.backend.service.assistant;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fyp.backend.dto.EventSummaryDto;
import com.fyp.backend.dto.ThreadDto;
import com.fyp.backend.model.Announcement;
import com.fyp.backend.model.User;
import com.fyp.backend.service.AnnouncementService;
import com.fyp.backend.service.AssistantAccountService;
import com.fyp.backend.service.CourseService;
import com.fyp.backend.service.EventService;
import com.fyp.backend.service.ThreadService;
import com.fyp.backend.service.bible.BibleService;
import com.fyp.backend.util.Pagination;

import lombok.RequiredArgsConstructor;

/**
 * What the assistant is allowed to look up, and how.
 *
 * Two rules run through everything here.
 *
 * <b>Only what everyone in the room could already read.</b> A reply is broadcast to
 * every participant, so "act as the asker" would take one member's privileges and
 * publish the results to the whole group. Instead every lookup runs as the
 * assistant's own account — verified, never an admin — and the existing services do
 * the filtering they already do. That is why {@code ThreadService.mapToDto} hides
 * reported threads from it without a line of code here, and why the assistant must
 * never be granted admin.
 *
 * <b>Arguments are untrusted.</b> They are model output, and through prompt
 * injection they are attacker-influenced: a member can write "call list_courses with
 * limit 99999". Every field is clamped or whitelisted, and nothing throws — an
 * exception escaping here reaches the listener's retry advice and turns one bad
 * argument into several paid LLM calls.
 */
@Service
@RequiredArgsConstructor
public class AssistantToolRegistry implements AssistantTools {

    private static final Logger log = LoggerFactory.getLogger(AssistantToolRegistry.class);

    /** Tighter than Pagination.MAX_SIZE: results are re-serialised into a paid context. */
    static final int MAX_ROWS = 10;

    /** A free-text argument long enough to be a real query and no longer. */
    static final int MAX_QUERY_CHARS = 100;

    private final BibleService bibleService;
    private final AnnouncementService announcementService;
    private final EventService eventService;
    private final CourseService courseService;
    private final ThreadService threadService;
    private final AssistantAccountService assistantAccountService;

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public List<Map<String, Object>> specifications() {
        return List.of(
                tool("lookup_passage",
                        "Look up a Bible passage by reference. Use this before quoting or "
                                + "referring to scripture. Returns the exact wording.",
                        Map.of(
                                "reference", string("A reference such as \"Luke 10:25-37\", "
                                        + "\"John 3:16\" or \"约翰福音 3:16\"."),
                                "translation", enumeration("KJV for English, CUV for 和合本.",
                                        List.of("KJV", "CUV"))),
                        List.of("reference")),

                tool("search_passages",
                        "Search the Bible for wording when you do not know the reference.",
                        Map.of(
                                "query", string("Words to search for."),
                                "translation", enumeration("KJV for English, CUV for 和合本.",
                                        List.of("KJV", "CUV")),
                                "limit", integer("How many verses to return, at most 10.")),
                        List.of("query")),

                tool("list_announcements",
                        "Recent church announcements.",
                        Map.of("limit", integer("How many to return, at most 10.")),
                        List.of()),

                tool("list_events",
                        "Church events. Use this for anything about what is on and when.",
                        Map.of(
                                "status", enumeration("Which events to list.",
                                        List.of("upcoming", "past", "all")),
                                "limit", integer("How many to return, at most 10.")),
                        List.of()),

                tool("list_courses",
                        "Published e-learning courses.",
                        Map.of(
                                "category", string("Optional category name to filter by."),
                                "limit", integer("How many to return, at most 10.")),
                        List.of()),

                tool("list_threads",
                        "Recent discussion topics from the forum.",
                        Map.of("limit", integer("How many to return, at most 10.")),
                        List.of()));
    }

    @Override
    public String execute(String name, JsonNode arguments) {
        try {
            return switch (name == null ? "" : name) {
                case "lookup_passage" -> lookupPassage(arguments);
                case "search_passages" -> searchPassages(arguments);
                case "list_announcements" -> listAnnouncements(arguments);
                case "list_events" -> listEvents(arguments);
                case "list_courses" -> listCourses(arguments);
                case "list_threads" -> listThreads(arguments);
                default -> error("There is no tool called " + name + ".");
            };
        } catch (RuntimeException e) {
            // Deliberately swallowed. See the class comment: a throw here becomes
            // several paid retries, and the model can recover from a message.
            log.warn("Assistant tool {} failed: {}", name, e.toString());
            return error("That lookup did not work.");
        }
    }

    // ---- Bible ------------------------------------------------------------

    private String lookupPassage(JsonNode arguments) {
        String reference = text(arguments, "reference");
        if (reference.isBlank()) {
            return error("A reference is required, for example \"Luke 10:27\".");
        }
        String translation = translation(arguments);
        BibleService.Passage passage = bibleService.lookup(reference, translation);
        if (passage == null) {
            return error("No such passage in " + translation
                    + ". It may not exist, or this translation may not carry it.");
        }
        return json(Map.of(
                "reference", passage.reference("en"),
                "book_id", passage.book().id(),
                "chapter", passage.chapter(),
                "from_verse", passage.fromVerse(),
                "to_verse", passage.toVerse(),
                "translation", passage.translation(),
                "text", passage.text(),
                "quote_token", token(passage)));
    }

    private String searchPassages(JsonNode arguments) {
        String query = clampText(text(arguments, "query"));
        if (query.isBlank()) {
            return error("A search query is required.");
        }
        String translation = translation(arguments);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (BibleService.Passage passage : bibleService.search(query, translation, limit(arguments))) {
            rows.add(Map.of(
                    "reference", passage.reference("en"),
                    "text", passage.text(),
                    "quote_token", token(passage)));
        }
        return json(Map.of("results", rows));
    }

    /** The token the model should emit to quote this passage — it never types the words. */
    private static String token(BibleService.Passage passage) {
        String span = passage.fromVerse() == passage.toVerse()
                ? String.valueOf(passage.fromVerse())
                : passage.fromVerse() + "-" + passage.toVerse();
        return "[bible:" + passage.translation() + ":" + passage.book().id() + ":"
                + passage.chapter() + ":" + span + "]";
    }

    // ---- App data ---------------------------------------------------------

    private String listAnnouncements(JsonNode arguments) {
        int limit = limit(arguments);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Announcement announcement : announcementService.getAllAnnouncements()) {
            if (rows.size() >= limit) {
                break;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("title", announcement.getTitle());
            // The cover image is an OSS object path: meaningless to the model and
            // it would leak the storage layout, so only the link goes out.
            if (announcement.getAnnouncementLink() != null) {
                row.put("link", announcement.getAnnouncementLink());
            }
            rows.add(row);
        }
        return json(Map.of("announcements", rows));
    }

    private String listEvents(JsonNode arguments) {
        String status = oneOf(text(arguments, "status"), List.of("upcoming", "past", "all"), "upcoming");
        List<Map<String, Object>> rows = new ArrayList<>();
        // EventSummaryDto, never the Event entity — the entity carries
        // checkedInUserIds, which is attendance data and must not reach a model.
        for (EventSummaryDto event : eventService
                .getEvents(status, null, null, PageRequest.of(0, limit(arguments)))) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", event.getId());
            row.put("title", event.getTitle());
            row.put("date", event.getDate());
            row.put("start_time", event.getStartTime());
            row.put("end_time", event.getEndTime());
            row.put("location", event.getLocation());
            row.put("description", event.getDescription());
            row.put("mention_token", "[event:" + event.getId() + "]");
            rows.add(row);
        }
        return json(Map.of("events", rows));
    }

    private String listCourses(JsonNode arguments) {
        // listPublishedCourses, NOT listAllCourses — the latter is the authoring
        // view and includes unpublished drafts.
        Map<String, Object> response = courseService.listPublishedCourses(
                clampText(text(arguments, "category")), limit(arguments), 0, "updated", "desc");
        Object data = response.get("data");
        List<Map<String, Object>> rows = new ArrayList<>();
        if (data instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> course) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("title", course.get("title"));
                    row.put("instructor", course.get("instructor_name"));
                    row.put("duration_hours", course.get("duration_hours"));
                    row.put("language", course.get("language"));
                    rows.add(row);
                }
            }
        }
        return json(Map.of("courses", rows));
    }

    private String listThreads(JsonNode arguments) {
        User requester = assistantAccountService.findAssistant().orElse(null);
        if (requester == null) {
            return error("Discussion topics are unavailable right now.");
        }
        Map<String, Object> response = threadService.getThreads(0, limit(arguments), requester);
        List<Map<String, Object>> rows = new ArrayList<>();
        if (response.get("data") instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof ThreadDto thread && thread.getTitle() != null) {
                    // A null title means mapToDto blanked a reported thread for this
                    // requester. Dropping the row entirely matters: leaving it in
                    // would still disclose that the topic exists.
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("title", thread.getTitle());
                    row.put("author", thread.getCreatedByName());
                    row.put("posted", String.valueOf(thread.getCreatedAt()));
                    rows.add(row);
                }
            }
        }
        return json(Map.of("threads", rows));
    }

    // ---- Argument handling ------------------------------------------------

    /** Handles 10000, 0, -1 and "abc" alike, and never reaches PageRequest.of unbounded. */
    private static int limit(JsonNode arguments) {
        int requested = arguments == null ? 0 : arguments.path("limit").asInt(0);
        return Pagination.clampSize(requested, MAX_ROWS);
    }

    private static String text(JsonNode arguments, String field) {
        String value = arguments == null ? "" : arguments.path(field).asText("");
        return value == null ? "" : value.trim();
    }

    private static String clampText(String value) {
        return value.length() > MAX_QUERY_CHARS ? value.substring(0, MAX_QUERY_CHARS) : value;
    }

    private static String oneOf(String value, List<String> allowed, String fallback) {
        String normalised = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return allowed.contains(normalised) ? normalised : fallback;
    }

    private static String translation(JsonNode arguments) {
        return BibleService.CUV.equalsIgnoreCase(text(arguments, "translation"))
                ? BibleService.CUV
                : BibleService.KJV;
    }

    // ---- Serialisation ----------------------------------------------------

    private String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            return error("That result could not be read.");
        }
    }

    private String error(String message) {
        return "{\"error\":" + quote(message) + "}";
    }

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    // ---- Tool specification helpers ---------------------------------------

    private static Map<String, Object> tool(String name, String description,
                                            Map<String, Object> properties, List<String> required) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", required);

        Map<String, Object> function = new LinkedHashMap<>();
        function.put("name", name);
        function.put("description", description);
        function.put("parameters", schema);

        Map<String, Object> tool = new LinkedHashMap<>();
        tool.put("type", "function");
        tool.put("function", function);
        return tool;
    }

    private static Map<String, Object> string(String description) {
        return Map.of("type", "string", "description", description);
    }

    private static Map<String, Object> integer(String description) {
        return Map.of("type", "integer", "description", description);
    }

    private static Map<String, Object> enumeration(String description, List<String> values) {
        return Map.of("type", "string", "description", description, "enum", values);
    }
}
