package com.fyp.backend.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;

import org.junit.jupiter.api.Test;

class ContentSanitizerTest {

    private final ContentSanitizer sanitizer =
            new ContentSanitizer(List.of("asshole", "badword", "bad phrase", "傻逼"));

    @Test
    void masksStandaloneWordCaseInsensitively() {
        assertEquals("You ***!", sanitizer.mask("You ASSHOLE!"));
        assertEquals("***", sanitizer.mask("Asshole"));
    }

    @Test
    void ignoresWordsContainingBannedTermAsSubstring() {
        assertEquals("passage assign classic", sanitizer.mask("passage assign classic"));
        assertEquals("badwording", sanitizer.mask("badwording"));
    }

    @Test
    void masksAtPunctuationBoundaries() {
        assertEquals("(***) ***, ***.", sanitizer.mask("(asshole) asshole, asshole."));
    }

    @Test
    void masksEveryOccurrence() {
        assertEquals("*** and *** again", sanitizer.mask("asshole and badword again"));
    }

    @Test
    void masksMultiWordPhrases() {
        assertEquals("a *** here", sanitizer.mask("a bad phrase here"));
    }

    @Test
    void masksCjkTermsAsSubstrings() {
        assertEquals("你这个***啊", sanitizer.mask("你这个傻逼啊"));
        assertEquals("大***们", sanitizer.mask("大傻逼们"));
    }

    @Test
    void passesThroughNullAndEmpty() {
        assertNull(sanitizer.mask(null));
        assertEquals("", sanitizer.mask(""));
    }

    @Test
    void emptyWordlistIsNoOp() {
        assertEquals("anything at all", new ContentSanitizer(List.of()).mask("anything at all"));
    }

    @Test
    void defaultWordlistLoadsFromClasspath() {
        ContentSanitizer defaults = new ContentSanitizer();
        assertEquals("what the ***", defaults.mask("what the fuck"));
        assertEquals("the passage is long", defaults.mask("the passage is long"));
        assertEquals("真是***行为", defaults.mask("真是傻逼行为"));
    }
}
