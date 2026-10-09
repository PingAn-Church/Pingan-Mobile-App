import { Platform } from "react-native";
import i18n from "../../i18n";
import { formatName } from "./formatName";
import { parseServerDate } from "./serverDate";

// Pure helpers for drawing a chat message, shared by ChatPage and MessageBubble.
// Lifted out of ChatPage unchanged when the bubble became its own component.

// Shared server-UTC normalization — the local variant this replaces only
// covered the space-separated shape; see utils/serverDate for the full contract.
export const getMessageDate = (msg) =>
  parseServerDate(msg?.timestamp) || parseServerDate(msg?.createdAt) || new Date(0);

export const formatTime = (msg) => {
  const date = getMessageDate(msg);
  return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(date);
};

export const parseVoiceContent = (content) => {
  if (!content) return { audioUrl: "", duration: 0 };
  const [audioUrl, durationPart] = String(content).split("|");
  return {
    audioUrl: audioUrl || "",
    duration: Number.parseInt(durationPart, 10) || 0,
  };
};

export const normalizeTranslationLanguage = (languageCode) => {
  const raw = String(languageCode || "en").trim().toLowerCase();
  const base = raw.split("-")[0];
  return base === "zh" ? "zh" : "en";
};

const containsChineseChars = (value) => /[㐀-鿿豈-﫿]/.test(String(value || ""));
const containsLatinChars = (value) => /[A-Za-z]/.test(String(value || ""));

export const resolveTargetTranslationLanguage = (content, appLanguage) => {
  if (containsChineseChars(content)) {
    return "en";
  }

  if (containsLatinChars(content)) {
    return "zh";
  }

  return normalizeTranslationLanguage(appLanguage);
};

const normalizeDeliveryState = (value) => {
  const raw = String(value || "").toUpperCase();
  if (raw === "READ") return "seen";
  if (raw === "DELIVERED") return "delivered";
  if (raw === "SENT") return "sent";
  return null;
};

export const resolveOutgoingDeliveryState = (deliveryStatusMap, currentUserId) => {
  const recipientStates = Object.entries(deliveryStatusMap || {})
    .filter(([recipientId]) => String(recipientId) !== String(currentUserId))
    .map(([, status]) => normalizeDeliveryState(status))
    .filter(Boolean);

  if (!recipientStates.length) return null;
  if (recipientStates.includes("seen")) return "seen";
  if (recipientStates.includes("delivered")) return "delivered";
  if (recipientStates.includes("sent")) return "sent";
  return null;
};

export const formatDeliveryStateLabel = (state) => {
  if (state === "seen") return "Seen";
  if (state === "delivered") return "Delivered";
  if (state === "sent") return "Sent";
  return "";
};

const escapeForRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Splits message text so the names it calls out can be drawn differently from
 * the rest. Falls back to plain text when a mentioned name can't be resolved —
 * a missing highlight is better than a crash or a mangled message.
 */
export const splitOnMentions = (content, labels) => {
  const text = String(content ?? "");
  const usable = (labels || []).filter(Boolean).map(escapeForRegex);
  if (!usable.length) return [{ text, isMention: false }];

  const pattern = new RegExp(`@(?:${usable.join("|")})`, "g");
  const parts = [];
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push({ text: text.slice(cursor, match.index), isMention: false });
    }
    parts.push({ text: match[0], isMention: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), isMention: false });
  return parts.length ? parts : [{ text, isMention: false }];
};

export const webFontSize = (baseSize) => (Platform.OS === "web" ? baseSize + 7 : baseSize);

/**
 * Who sent a message (or a quoted one), as the reader should see it: the
 * assistant is named in the reader's language and carries no surname; people
 * go through formatName so a Chinese reader sees family name first.
 */
export const senderDisplayName = (message, language) => {
  if (!message) return "";
  if (message.senderBot) {
    return (
      (String(language || "").startsWith("zh") && message.senderDisplayNameZh) ||
      message.senderFirstName ||
      i18n.t("unknownUser")
    );
  }
  return formatName(message.senderFirstName, message.senderLastName) || i18n.t("unknownUser");
};
