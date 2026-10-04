package com.fyp.backend.model;

import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * The stickers a chat message may carry.
 *
 * The pictures themselves ship inside the app (frontend/src/utils/stickers.js
 * is the twin of this file); the server only needs to know which ids are real
 * and what each one falls back to. That fallback — one emoji — is what the
 * server writes as the message body, and so what every reader without the
 * picture sees: a build that predates stickers draws an unknown type as text,
 * and the same body is the chat-list preview, the quote in a reply and the
 * tail of the push notification.
 *
 * Ids are namespaced by pack ("basic.") so a later pack cannot collide, and
 * they are permanent: stored messages point at them. Emojis are chosen from
 * the long-supported set so the fallback is not a blank box on an old phone.
 * {@code name} is the plain English word the assistant is given.
 */
public final class StickerCatalog {

    public record Sticker(String id, String emoji, String name) {}

    private static final Map<String, Sticker> STICKERS = new LinkedHashMap<>();

    static {
        add("basic.hello", "👋", "hello");
        add("basic.praying", "🙏", "praying");
        add("basic.hug", "🤗", "hug");
        add("basic.cheers", "🍷", "cheers");
        add("basic.fingerheart", "❤️", "love");
        add("basic.itsokay", "🐑", "it's okay");
        add("basic.what", "❓", "what?");
        add("basic.speechless", "🤦", "speechless");
    }

    private StickerCatalog() {
    }

    private static void add(String id, String emoji, String name) {
        STICKERS.put(id, new Sticker(id, emoji, name));
    }

    /** The sticker with this id; empty for null, blank and unknown ids. */
    public static Optional<Sticker> find(String id) {
        return id == null ? Optional.empty() : Optional.ofNullable(STICKERS.get(id.trim()));
    }

    /** Every sticker, in panel order. */
    public static Collection<Sticker> all() {
        return Collections.unmodifiableCollection(STICKERS.values());
    }
}
