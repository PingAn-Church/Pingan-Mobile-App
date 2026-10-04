package com.fyp.backend.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class MessageKindTest {

    @Test
    void resolvesStoredStringsRegardlessOfCase() {
        assertEquals(MessageKind.IMAGE, MessageKind.of("image"));
        assertEquals(MessageKind.IMAGE, MessageKind.of(" Image "));
        assertEquals(MessageKind.VOICE, MessageKind.of("VOICE"));
        assertEquals(MessageKind.EVENT, MessageKind.of("event"));
        assertEquals(MessageKind.TEXT, MessageKind.of("text"));
    }

    @Test
    void nullBlankAndUnknownTypesBehaveAsText() {
        // A build that ships a type before the server learns it must degrade to
        // a text bubble, not be refused.
        assertEquals(MessageKind.TEXT, MessageKind.of(null));
        assertEquals(MessageKind.TEXT, MessageKind.of("  "));
        assertEquals(MessageKind.TEXT, MessageKind.of("hologram"));
    }

    @Test
    void onlyWordsAreEditableAndOnlyWordsNeedABody() {
        assertTrue(MessageKind.TEXT.isEditable());
        assertFalse(MessageKind.IMAGE.isEditable());
        assertFalse(MessageKind.VOICE.isEditable());
        assertFalse(MessageKind.EVENT.isEditable());

        assertTrue(MessageKind.TEXT.requiresContent());
        assertFalse(MessageKind.IMAGE.requiresContent());
        assertFalse(MessageKind.EVENT.requiresContent());
    }

    @Test
    void mediaBodiesAreUrlsAndSkipTheWordFilter() {
        assertTrue(MessageKind.IMAGE.hasMediaBody());
        assertTrue(MessageKind.VOICE.hasMediaBody());
        assertFalse(MessageKind.TEXT.hasMediaBody());
        assertFalse(MessageKind.EVENT.hasMediaBody());
        assertTrue(MessageKind.EVENT.serverWritesBody());
    }

    @Test
    void pushBodiesArePlaceholdersForEverythingButWords() {
        assertNull(MessageKind.TEXT.pushBodyKey());
        assertEquals("push.chat.photo", MessageKind.IMAGE.pushBodyKey());
        assertEquals("push.chat.voice", MessageKind.VOICE.pushBodyKey());
        assertEquals("push.chat.event", MessageKind.EVENT.pushBodyKey());
    }

    @Test
    void aGroupNoticeIsServerWrittenAndCannotBeSentByAClient() {
        assertEquals(MessageKind.NOTICE, MessageKind.of("notice"));
        assertTrue(MessageKind.NOTICE.serverWritesBody());
        assertFalse(MessageKind.NOTICE.clientMaySend());
        assertFalse(MessageKind.NOTICE.isEditable());
        assertFalse(MessageKind.NOTICE.requiresContent());
        assertEquals("push.chat.notice", MessageKind.NOTICE.pushBodyKey());
        // Everything a person types may be sent.
        assertTrue(MessageKind.TEXT.clientMaySend());
        assertTrue(MessageKind.IMAGE.clientMaySend());
        assertTrue(MessageKind.VOICE.clientMaySend());
        assertTrue(MessageKind.EVENT.clientMaySend());
    }

    @Test
    void aStickerIsSentByClientsButItsBodyIsTheServers() {
        assertEquals(MessageKind.STICKER, MessageKind.of("sticker"));
        assertTrue(MessageKind.STICKER.clientMaySend());
        assertTrue(MessageKind.STICKER.serverWritesBody());
        assertFalse(MessageKind.STICKER.requiresContent());
        assertFalse(MessageKind.STICKER.isEditable());
        // The picture ships in the app; there is no stored media to delete.
        assertFalse(MessageKind.STICKER.hasMediaBody());
        assertEquals("push.chat.sticker", MessageKind.STICKER.pushBodyKey());
        assertEquals("[sticker] 🙏", MessageKind.STICKER.readable("🙏"));
    }

    @Test
    void theAssistantReadsMediaAsPlaceholdersAndSharesAsLabelledCards() {
        assertEquals("hello", MessageKind.TEXT.readable("hello"));
        assertEquals("", MessageKind.TEXT.readable(null));
        assertEquals("[photo]", MessageKind.IMAGE.readable("https://bucket/conversations/5/a.jpg"));
        assertEquals("[voice message]", MessageKind.VOICE.readable("https://bucket/x.m4a|12"));
        assertEquals("[shared event] Sunday Service · 2026-10-04 10:00 AM · Hall",
                MessageKind.EVENT.readable("📅 Sunday Service · 2026-10-04 10:00 AM · Hall"));
        assertEquals("[group notice] Service moves to 10:00 this week",
                MessageKind.NOTICE.readable("📌 Service moves to 10:00 this week"));
        assertEquals("[poll] Where shall we meet?", MessageKind.POLL.readable("📊 Where shall we meet?"));
        assertEquals("[poll] Potluck sign-up", MessageKind.POLL.readable("📝 Potluck sign-up"));
        // Created through its own endpoint, never typed; its body is pushed as it stands.
        assertFalse(MessageKind.POLL.clientMaySend());
        assertTrue(MessageKind.POLL.serverWritesBody());
        assertNull(MessageKind.POLL.pushBodyKey());
    }
}
