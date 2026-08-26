package com.fyp.backend.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/**
 * The same cases as frontend/scripts/check-inline-markup.mjs, seen through
 * strip(): what comes off, and — the part that matters — what stays as typed.
 */
class InlineMarkupTest {

    @Test
    void removesHonouredMarkers() {
        assertEquals("bold", InlineMarkup.strip("**bold**"));
        assertEquals("bold", InlineMarkup.strip("*bold*"));
        assertEquals("italic", InlineMarkup.strip("_italic_"));
        assertEquals("italic", InlineMarkup.strip("__italic__"));
        assertEquals("struck", InlineMarkup.strip("~struck~"));
        assertEquals("struck", InlineMarkup.strip("~~struck~~"));
        assertEquals("see this now", InlineMarkup.strip("see **this** now"));
        assertEquals("bold and italic", InlineMarkup.strip("**bold** and _italic_"));
        assertEquals("bold both bold", InlineMarkup.strip("**bold _both_ bold**"));
        assertEquals("italic both italic", InlineMarkup.strip("_italic **both** italic_"));
        assertEquals("(bold)", InlineMarkup.strip("(**bold**)"));
        assertEquals("bold, then", InlineMarkup.strip("**bold**, then"));
        assertEquals("\"quoted\"", InlineMarkup.strip("\"*quoted*\""));
        assertEquals("3 apples", InlineMarkup.strip("*3 apples*"));
        assertEquals("a b", InlineMarkup.strip("**a** **b**"));
        assertEquals("@Someone hi", InlineMarkup.strip("@Someone *hi*"));
        assertEquals("emoji 🙏 bold 🙏", InlineMarkup.strip("emoji 🙏 **bold** 🙏"));
        // On purpose: the closer is followed by punctuation, which "**bold**." needs.
        assertEquals("init.py", InlineMarkup.strip("__init__.py"));
    }

    @Test
    void worksWithoutSpacesAsChineseHasNone() {
        assertEquals("多个字", InlineMarkup.strip("**多个字**"));
        assertEquals("我觉得很好呢", InlineMarkup.strip("我觉得*很好*呢"));
        assertEquals("主说：你们要彼此相爱。", InlineMarkup.strip("主说：**你们要彼此相爱**。"));
    }

    @Test
    void neverSpansALineBreak() {
        assertEquals("line one b\nline two i", InlineMarkup.strip("line one **b**\nline two _i_"));
        assertEquals("**never\ncloses**", InlineMarkup.strip("**never\ncloses**"));
    }

    @Test
    void leavesOrdinaryTextExactlyAsTyped() {
        String[] untouched = {
            "snake_case_name", "file_v2_final", "5*3*2", "2 * 3 * 4", "a * b", "price: $5*",
            "*not bold", "not bold*", "** not bold **", "*mismatched**", "**mismatched*",
            "***", "****", "***decorated***", "~ approx", "~/Documents", "about ~50 people",
            "a*b*c", "*a*b", "h_e_l_l_o", "x_1 + x_2", "plain text", "**", "*",
        };
        for (String text : untouched) {
            assertEquals(text, InlineMarkup.strip(text), text);
        }
    }

    @Test
    void nullAndEmptyBecomeEmpty() {
        assertEquals("", InlineMarkup.strip(null));
        assertEquals("", InlineMarkup.strip(""));
    }
}
