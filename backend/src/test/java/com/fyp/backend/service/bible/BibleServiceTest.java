package com.fyp.backend.service.bible;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.fyp.backend.service.bible.BibleService.Passage;

/**
 * The corpus is generated data, so these assert the properties that would let a
 * bad conversion or a bad lookup reach a congregation: wrong wording, a silently
 * substituted neighbouring verse, or a whole chapter dumped into a chat bubble.
 */
class BibleServiceTest {

    private static final BibleService bible = new BibleService();

    @Test
    void quotesTheRealWordingInBothTranslations() {
        assertEquals(
                "And he answering said, Thou shalt love the Lord thy God with all thy heart, "
                        + "and with all thy soul, and with all thy strength, and with all thy mind; "
                        + "and thy neighbour as thyself.",
                bible.lookup("Luke 10:27", BibleService.KJV).text());

        assertEquals("他回答说：「你要尽心、尽性、尽力、尽意爱主—你的　神；又要爱邻舍如同自己。」",
                bible.lookup("Luke 10:27", BibleService.CUV).text());
    }

    @Test
    void resolvesReferencesHoweverTheyAreWritten() {
        Passage viaEnglish = bible.lookup("John 3:16", BibleService.KJV);
        Passage viaCode = bible.lookup("JHN 3:16", BibleService.KJV);
        Passage viaChinese = bible.lookup("约翰福音 3:16", BibleService.KJV);
        Passage viaChineseNoSpace = bible.lookup("约翰福音3:16", BibleService.KJV);

        assertNotNull(viaEnglish);
        assertEquals(viaEnglish.text(), viaCode.text());
        assertEquals(viaEnglish.text(), viaChinese.text());
        assertEquals(viaEnglish.text(), viaChineseNoSpace.text());
    }

    @Test
    void numberedBooksAreNotMistakenForChapters() {
        Passage passage = bible.lookup("1 Corinthians 13:4-7", BibleService.KJV);
        assertNotNull(passage);
        assertEquals("1 Corinthians", passage.book().en());
        assertEquals(13, passage.chapter());
        assertTrue(passage.text().contains("Charity suffereth long"));
    }

    /** The footnote's popup text sits inside the verse in the source HTML. */
    @Test
    void editorialNotesAreNotPartOfTheVerse() {
        assertFalse(bible.lookup("Luke 10:6", BibleService.CUV).text().contains("原文是"));
        assertFalse(bible.lookup("Genesis 4:1", BibleService.KJV).text().contains("that is, Gotten"));
    }

    /** The KJV's italicised supplied words are scripture, not markup. */
    @Test
    void suppliedWordsSurvive() {
        assertTrue(bible.lookup("Luke 10:2", BibleService.KJV).text()
                .contains("The harvest truly is great"));
    }

    /** Slicing to the end of the next verse marker used to append its number. */
    @Test
    void verseTextDoesNotCarryTheNextVerseNumber() {
        assertFalse(bible.lookup("John 3:16", BibleService.KJV).text().trim().endsWith("17"));
        assertFalse(bible.lookup("Luke 10:27", BibleService.CUV).text().trim().endsWith("28"));
    }

    /** The CUV merges verse pairs the KJV numbers separately. */
    @Test
    void bridgedVersesAreReachableByEitherNumber() {
        Passage first = bible.lookup("Numbers 1:20", BibleService.CUV);
        Passage second = bible.lookup("Numbers 1:21", BibleService.CUV);
        assertNotNull(first);
        assertNotNull(second, "1:21 is inside a bridged CUV row and must still resolve");
        assertEquals(first.text(), second.text());
    }

    /** Twelve verses the CUV's base text omits. Silence here would be a wrong answer. */
    @Test
    void versesAbsentFromTheChineseTextAreReportedNotSubstituted() {
        assertNull(bible.lookup("Acts 8:37", BibleService.CUV));
        assertNotNull(bible.lookup("Acts 8:37", BibleService.KJV));

        String rendered = bible.render("[bible:CUV:44:8:37]", "zh");
        assertTrue(rendered.contains("未收录"), rendered);
        assertFalse(rendered.contains("腓利"), "must not fall back to a neighbouring verse");
    }

    @Test
    void tokensAreReplacedWithRealText() {
        String rendered = bible.render("As it says, [bible:KJV:43:3:16] — that is the gospel.", "en");
        assertTrue(rendered.contains("For God so loved the world"));
        assertTrue(rendered.contains("John 3:16"));
        assertFalse(rendered.contains("[bible:"));
    }

    /** A chat message is one shared artefact, so the reader's language wins. */
    @Test
    void theReadersLanguageOverridesTheTokensTranslation() {
        assertTrue(bible.render("[bible:KJV:43:3:16]", "zh").contains("神爱世人"));
        assertTrue(bible.render("[bible:CUV:43:3:16]", "en").contains("For God so loved"));
    }

    @Test
    void aWholePsalmCannotBeDroppedIntoAChatBubble() {
        String rendered = bible.render("[bible:KJV:19:119:1-176]", "en");
        assertFalse(rendered.contains("[bible:"));
        assertTrue(rendered.length() < 3000, "a 176-verse range must be capped");
    }

    @Test
    void onlySixQuotesSurvivePerReply() {
        String tokens = "[bible:KJV:43:3:16] ".repeat(9);
        String rendered = bible.render(tokens, "en");
        int quotes = rendered.split("John 3:16", -1).length - 1;
        assertEquals(BibleService.MAX_TOKENS_PER_REPLY, quotes);
    }

    @Test
    void unresolvableTokensAreStrippedRatherThanShown() {
        assertEquals("Nothing there.", bible.render("Nothing there. [bible:KJV:99:1:1]", "en"));
        assertEquals("Nothing there.", bible.render("Nothing there. [bible:KJV:43:999:1]", "en"));
    }

    /** Postgres full-text search cannot segment Chinese; the bigram index can. */
    @Test
    void chineseSearchFindsAPhraseWithNoWordBoundaries() {
        List<Passage> hits = bible.search("爱邻舍", BibleService.CUV, 10);
        assertTrue(hits.stream().anyMatch(p -> p.book().id() == 42 && p.chapter() == 10),
                "爱邻舍 should reach Luke 10");
    }

    @Test
    void englishSearchRanksVersesCarryingEveryTerm() {
        List<Passage> hits = bible.search("love neighbour thyself", BibleService.KJV, 5);
        assertFalse(hits.isEmpty());
        assertTrue(hits.get(0).text().toLowerCase().contains("neighbour"));
    }

    @Test
    void searchAndLookupAgreeOnCoordinates() {
        Passage found = bible.search("only begotten Son", BibleService.KJV, 3).stream()
                .filter(p -> p.book().id() == 43 && p.chapter() == 3 && p.fromVerse() == 16)
                .findFirst()
                .orElse(null);
        assertNotNull(found);
        assertEquals(bible.lookup("John 3:16", BibleService.KJV).text(), found.text());
    }

    /**
     * A model replying in Chinese types a fullwidth colon without thinking. Before
     * this was tolerated the token missed TOKEN, matched the leftover sweep, and was
     * deleted — the quote vanished with nothing left to show it had been there.
     */
    @Test
    void aTokenWrittenWithAFullwidthColonStillResolves() {
        String rendered = bible.render("[bible:CUV:43:3:16]", "zh");
        assertEquals(rendered, bible.render("[bible:CUV:43:3：16]", "zh"));
        assertTrue(rendered.contains("神爱世人"));
    }

    @Test
    void aTokenWithStraySpacingStillResolves() {
        assertTrue(bible.render("[bible: KJV : 43 : 3 : 16 ]", "en")
                .contains("For God so loved the world"));
    }

    /** A citation the assistant may point at without quoting. */
    @Test
    void aWrittenReferenceIsNormalisedWhenItNamesSomethingReal() {
        assertEquals("路加福音 15:11-32", bible.normaliseReference("路加福音15：11-32", "zh"));
        assertEquals("Luke 15:11-32", bible.normaliseReference("Luke 15:11-32", "en"));
        assertEquals("John 3:16", bible.normaliseReference("JHN 3:16", "en"));
        assertEquals("Psalms 23", bible.normaliseReference("Psalms 23", "en"));
    }

    /**
     * The range is echoed, not clamped. Fifteen verses limits how much text lands in
     * a chat bubble; trimming a citation to "15:11-25" would just make it wrong.
     */
    @Test
    void aLongReferenceKeepsItsRangeBecauseItIsAPointerNotAQuote() {
        assertEquals("Luke 15:11-32", bible.normaliseReference("Luke 15:11-32", "en"));
    }

    @Test
    void aReferenceToNothingRealIsRejected() {
        assertNull(bible.normaliseReference("Hesitations 4:2", "en"));
        assertNull(bible.normaliseReference("John 999:1", "en"));
        assertNull(bible.normaliseReference("photo", "en"));
        assertNull(bible.normaliseReference("", "en"));
    }
}
