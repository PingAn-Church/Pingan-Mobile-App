package com.fyp.backend.model;

import java.util.Locale;

/**
 * What a chat message's {@code type} means, in one place.
 *
 * Every rule that depends on the type used to be a string comparison in the
 * spot that needed it — the sanitizer skip, the push placeholder, the edit
 * refusal, the media cleanup on delete, the assistant's reading of history.
 * Adding a type meant finding all of them. Now a type is one constant here and
 * the call sites ask it questions.
 *
 * The stored {@code type} string itself is left exactly as the client sent it
 * (it always was), and a type this enum does not know behaves as text did: the
 * body is filtered and pushed as the sender's words. That keeps a build that
 * ships a new type before the server learns it (the sticker project, say) from
 * being refused outright — it degrades to a text bubble everywhere instead.
 */
public enum MessageKind {

    /** The sender's own words. */
    TEXT("text", false, true, false, true, true, null, null),

    /** A photo: the body is a managed OSS URL. */
    IMAGE("image", true, false, false, false, true, "push.chat.photo", "[photo]"),

    /** A voice note: the body is a managed OSS URL plus {@code |durationSeconds}. */
    VOICE("voice", true, false, false, false, true, "push.chat.voice", "[voice message]"),

    /**
     * A shared event card. The body is written by the server from the event
     * (see ChatService.prepareEventShare); the push body carries its title.
     */
    EVENT("event", false, false, true, false, true, "push.chat.event", "[shared event] "),

    /**
     * The "📌" line posted when a group admin pins a message as the group
     * notice. Written by the server (ChatService.postGroupNotice) and quoting
     * the pinned message; a client cannot send one directly — it pins instead.
     */
    NOTICE("notice", false, false, true, false, false, "push.chat.notice", "[group notice] "),

    /**
     * A poll or sign-up sheet. Created through ChatService.createPoll, which
     * writes the body ("📊 question" / "📝 question") and binds the poll row; the
     * push carries that body as it stands, since it is language-neutral already.
     */
    POLL("poll", false, false, true, false, false, null, "[poll] "),

    /**
     * A sticker from {@link StickerCatalog}. The client names it by id; the
     * body is written by the server as the sticker's fallback emoji (see
     * ChatService.prepareSticker), which is what a build without the picture
     * shows. The picture ships in the app, so there is no media to clean up.
     */
    STICKER("sticker", false, false, true, false, true, "push.chat.sticker", "[sticker] ");

    private final String type;
    private final boolean mediaBody;
    private final boolean editable;
    private final boolean serverWritesBody;
    private final boolean requiresContent;
    private final boolean clientMaySend;
    private final String pushBodyKey;
    private final String assistantPlaceholder;

    MessageKind(String type, boolean mediaBody, boolean editable, boolean serverWritesBody,
            boolean requiresContent, boolean clientMaySend, String pushBodyKey, String assistantPlaceholder) {
        this.type = type;
        this.mediaBody = mediaBody;
        this.editable = editable;
        this.serverWritesBody = serverWritesBody;
        this.requiresContent = requiresContent;
        this.clientMaySend = clientMaySend;
        this.pushBodyKey = pushBodyKey;
        this.assistantPlaceholder = assistantPlaceholder;
    }

    /** The kind for a stored or submitted type string; null, blank and unknown read as {@link #TEXT}. */
    public static MessageKind of(String type) {
        if (type == null) {
            return TEXT;
        }
        String normalized = type.trim().toLowerCase(Locale.ROOT);
        for (MessageKind kind : values()) {
            if (kind.type.equals(normalized)) {
                return kind;
            }
        }
        return TEXT;
    }

    /** The canonical type string clients send and receive. */
    public String type() {
        return type;
    }

    /**
     * Whether the body is a URL into managed storage rather than words: skipped
     * by the objectionable-word filter, and its object deleted with the message.
     */
    public boolean hasMediaBody() {
        return mediaBody;
    }

    /** Whether the sender may change the body after sending. */
    public boolean isEditable() {
        return editable;
    }

    /** Whether the server composes the body itself and ignores what the client sent. */
    public boolean serverWritesBody() {
        return serverWritesBody;
    }

    /** Whether an empty body is refused on send. */
    public boolean requiresContent() {
        return requiresContent;
    }

    /** Whether a client may post this kind through the send endpoint at all. */
    public boolean clientMaySend() {
        return clientMaySend;
    }

    /**
     * Message-bundle key for the push body, or null when the push should carry
     * the sender's own words. EVENT's key takes the event title as {0}, and
     * STICKER's the sticker's emoji.
     */
    public String pushBodyKey() {
        return pushBodyKey;
    }

    /**
     * How the assistant reads a message of this kind in a conversation transcript.
     * Media becomes a placeholder — a storage URL means nothing to a model and
     * would leak the bucket layout. A shared event or a notice is labelled so the
     * model knows it is a card, not somebody's words. Text is itself.
     */
    public String readable(String content) {
        String body = content == null ? "" : content;
        return switch (this) {
            case TEXT -> body;
            case IMAGE, VOICE -> assistantPlaceholder;
            case EVENT -> assistantPlaceholder + body.replaceFirst("^📅\\s*", "");
            case NOTICE -> assistantPlaceholder + body.replaceFirst("^📌\\s*", "");
            case POLL -> assistantPlaceholder + body.replaceFirst("^[📊📝]\\s*", "");
            case STICKER -> assistantPlaceholder + body;
        };
    }
}
