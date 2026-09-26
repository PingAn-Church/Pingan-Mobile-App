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
    TEXT("text", false, true, false, true, null, null),

    /** A photo: the body is a managed OSS URL. */
    IMAGE("image", true, false, false, false, "push.chat.photo", "[photo]"),

    /** A voice note: the body is a managed OSS URL plus {@code |durationSeconds}. */
    VOICE("voice", true, false, false, false, "push.chat.voice", "[voice message]"),

    /**
     * A shared event card. The body is written by the server from the event
     * (see ChatService.prepareEventShare); the push body carries its title.
     */
    EVENT("event", false, false, true, false, "push.chat.event", "[shared event] ");

    private final String type;
    private final boolean mediaBody;
    private final boolean editable;
    private final boolean serverWritesBody;
    private final boolean requiresContent;
    private final String pushBodyKey;
    private final String assistantPlaceholder;

    MessageKind(String type, boolean mediaBody, boolean editable, boolean serverWritesBody,
            boolean requiresContent, String pushBodyKey, String assistantPlaceholder) {
        this.type = type;
        this.mediaBody = mediaBody;
        this.editable = editable;
        this.serverWritesBody = serverWritesBody;
        this.requiresContent = requiresContent;
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

    /**
     * Message-bundle key for the push body, or null when the push should carry
     * the sender's own words. EVENT's key takes the event title as {0}.
     */
    public String pushBodyKey() {
        return pushBodyKey;
    }

    /**
     * How the assistant reads a message of this kind in a conversation transcript.
     * Media becomes a placeholder — a storage URL means nothing to a model and
     * would leak the bucket layout. A shared event is labelled so the model knows
     * it is a card, not somebody's words. Text is itself.
     */
    public String readable(String content) {
        String body = content == null ? "" : content;
        return switch (this) {
            case TEXT -> body;
            case IMAGE, VOICE -> assistantPlaceholder;
            case EVENT -> assistantPlaceholder + body.replaceFirst("^📅\\s*", "");
        };
    }
}
