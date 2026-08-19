package com.fyp.backend.service.assistant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;

import com.fyp.backend.service.EventService;
import com.fyp.backend.service.bible.BibleService;

/**
 * What actually reaches the group. The model is told the token format, but a prompt
 * is guidance — these cover what happens when it writes something close instead.
 */
class AssistantReplyRendererTest {

    private final AssistantReplyRenderer renderer =
            new AssistantReplyRenderer(new BibleService(), mock(EventService.class));

    /** The exact thing a Chinese reply produced in production. */
    @Test
    void aBracketedChineseCitationIsPrintedProperlyRatherThanLeftLookingBroken() {
        String rendered = renderer.render("这个比喻在[路加福音15：11-32]。", "zh");
        assertEquals("这个比喻在路加福音 15:11-32。", rendered);
        assertFalse(rendered.contains("["), rendered);
    }

    @Test
    void aBracketedEnglishCitationIsUnwrappedToo() {
        assertEquals("See Luke 15:11-32 for the parable.",
                renderer.render("See [Luke 15:11-32] for the parable.", "en"));
    }

    /** Square brackets around anything else are none of our business. */
    @Test
    void bracketsAroundOrdinaryTextAreLeftAlone() {
        assertEquals("He sent a [photo] earlier.",
                renderer.render("He sent a [photo] earlier.", "en"));
        assertEquals("A note [see below] follows.",
                renderer.render("A note [see below] follows.", "en"));
    }

    /** A citation to nothing real must not be dressed up as though it checked out. */
    @Test
    void anInventedCitationIsNotLegitimisedByUnwrapping() {
        String rendered = renderer.render("As [Hesitations 4:2] says.", "en");
        assertTrue(rendered.contains("[Hesitations 4:2]"), rendered);
    }

    @Test
    void realTokensStillBecomeRealScripture() {
        String rendered = renderer.render("It says [bible:KJV:43:3:16] plainly.", "en");
        assertTrue(rendered.contains("For God so loved the world"));
        assertFalse(rendered.contains("[bible:"));
    }

    /** A near-miss token must resolve, not be swept away as debris. */
    @Test
    void aTokenWithAFullwidthColonIsNotSilentlyDeleted() {
        String rendered = renderer.render("[bible:CUV:43:3：16]", "zh");
        assertTrue(rendered.contains("神爱世人"), rendered);
    }

    /** Anything still token-shaped after substitution was invented and does not ship. */
    @Test
    void unresolvableTokensAreStripped() {
        assertEquals("Nothing here.", renderer.render("Nothing here. [bible:KJV:99:1:1]", "en"));
    }
}
