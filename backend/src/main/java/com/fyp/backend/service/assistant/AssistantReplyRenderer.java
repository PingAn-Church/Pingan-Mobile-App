package com.fyp.backend.service.assistant;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import com.fyp.backend.model.Event;
import com.fyp.backend.service.EventService;
import com.fyp.backend.service.bible.BibleService;

import lombok.RequiredArgsConstructor;

/**
 * Turns the assistant's tokens into text, and removes any it made up.
 *
 * The model writes only connective prose: scripture arrives as
 * {@code [bible:CUV:42:10:27]} and an event as {@code [event:42]}, and this class
 * supplies the wording from the server's own copy. A model will invent an event
 * date as readily as a verse, so the rule is the same for both — if the backend
 * cannot resolve the token, nothing is printed rather than something plausible.
 */
@Service
@RequiredArgsConstructor
public class AssistantReplyRenderer {

    private static final Pattern EVENT = Pattern.compile("\\[event:(\\d{1,18})\\]");

    /** Anything left in token shape after substitution was invented; it does not ship. */
    private static final Pattern LEFTOVER = Pattern.compile("\\[(?:bible|event):[^\\]]{0,80}\\]");

    private final BibleService bibleService;
    private final EventService eventService;

    public String render(String reply, String language) {
        if (reply == null || reply.isBlank()) {
            return "";
        }
        String rendered = bibleService.render(reply, language);
        rendered = renderEvents(rendered);
        rendered = LEFTOVER.matcher(rendered).replaceAll("");
        return rendered.replaceAll("[ \\t]{2,}", " ").trim();
    }

    private String renderEvents(String text) {
        Matcher matcher = EVENT.matcher(text);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            String replacement = "";
            try {
                Event event = eventService.getEventById(Long.parseLong(matcher.group(1))).orElse(null);
                if (event != null) {
                    replacement = describe(event);
                }
            } catch (RuntimeException ignored) {
                // An unresolvable id prints nothing. Better a gap than a wrong date.
            }
            matcher.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    /** One line, from the server's copy — never from anything the model wrote. */
    private static String describe(Event event) {
        StringBuilder line = new StringBuilder(String.valueOf(event.getTitle()));
        if (notBlank(event.getDate())) {
            line.append(" · ").append(event.getDate());
            if (notBlank(event.getStartTime())) {
                line.append(' ').append(event.getStartTime());
            }
        }
        if (notBlank(event.getLocation())) {
            line.append(" · ").append(event.getLocation());
        }
        return line.toString();
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
