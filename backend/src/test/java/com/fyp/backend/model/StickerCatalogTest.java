package com.fyp.backend.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

class StickerCatalogTest {

    @Test
    void holdsTheEightBasicStickersInPanelOrder() {
        List<String> ids = StickerCatalog.all().stream().map(StickerCatalog.Sticker::id).toList();

        assertEquals(List.of("basic.hello", "basic.praying", "basic.hug", "basic.cheers",
                "basic.fingerheart", "basic.itsokay", "basic.what", "basic.speechless"), ids);
    }

    @Test
    void everyFallbackEmojiIsDistinct() {
        // The app maps an emoji back to its sticker when an older server has
        // dropped the id; two stickers sharing one emoji would make that a guess.
        Set<String> emojis = new HashSet<>();
        for (StickerCatalog.Sticker sticker : StickerCatalog.all()) {
            assertFalse(sticker.emoji().isBlank());
            assertTrue(emojis.add(sticker.emoji()), "duplicate fallback: " + sticker.emoji());
        }
    }

    @Test
    void lookupToleratesNullBlankAndUnknownIds() {
        assertEquals("🙏", StickerCatalog.find("basic.praying").orElseThrow().emoji());
        assertEquals("🙏", StickerCatalog.find(" basic.praying ").orElseThrow().emoji());
        assertTrue(StickerCatalog.find(null).isEmpty());
        assertTrue(StickerCatalog.find("").isEmpty());
        assertTrue(StickerCatalog.find("basic.speachless").isEmpty(), "the misspelt id never shipped");
        assertTrue(StickerCatalog.find("other.praying").isEmpty());
    }
}
