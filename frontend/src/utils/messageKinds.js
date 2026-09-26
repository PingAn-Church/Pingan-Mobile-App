import i18n from "../../i18n";

/**
 * What each chat message `type` means on the client, in one place.
 *
 * The server keeps the matching registry (MessageKind.java). Each entry says
 * how the message is drawn, what the conversation list shows for it, and which
 * long-press actions apply. A type this map does not know is drawn as text and
 * previewed by its content — which is exactly what the server writes into the
 * body of every non-text kind, so an older build never shows garbage.
 */
const previewContent = (message) => String(message?.content || "");

export const MESSAGE_KINDS = {
  text: {
    bubble: "text",
    preview: previewContent,
    canCopy: true,
    canDownload: false,
    canTranslate: true,
    canEdit: true,
  },
  image: {
    bubble: "image",
    preview: () => i18n.t("chatPreviewPhoto"),
    canCopy: true,
    canDownload: true,
    canTranslate: false,
    canEdit: false,
  },
  voice: {
    bubble: "voice",
    preview: () => i18n.t("chatPreviewVoice"),
    canCopy: false,
    canDownload: false,
    canTranslate: false,
    canEdit: false,
  },
  // The body is the server-written "📅 Title · date · place" line, which is
  // the right preview as it stands.
  event: {
    bubble: "event",
    preview: previewContent,
    canCopy: false,
    canDownload: false,
    canTranslate: false,
    canEdit: false,
  },
};

/** The kind for a message or a bare type string; unknown and missing types read as text. */
export const kindOf = (messageOrType) => {
  const type =
    typeof messageOrType === "string" ? messageOrType : messageOrType?.type;
  return MESSAGE_KINDS[String(type || "text").toLowerCase()] || MESSAGE_KINDS.text;
};

/** One line standing in for the message in a conversation list or sidebar. */
export const messagePreview = (message) => kindOf(message).preview(message);
