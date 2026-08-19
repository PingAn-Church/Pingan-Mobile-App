import i18n from "../../i18n";
import { serverDateMillis } from "./serverDate";

/**
 * The name to show for a group conversation.
 *
 * Ordinary groups have exactly one name — whatever their creator typed — and it
 * is shown to everyone as-is. The app-level group is the one exception: it is
 * named in both languages and ships both, so the reader sees it in theirs and a
 * language toggle renames the row immediately, with no refetch.
 */
export const groupDisplayName = (conversation, language) => {
  if (!conversation) return i18n.t("groupChat");
  const chinese = conversation.groupNameZh;
  if (language === "zh" && chinese) return chinese;
  return conversation.groupName || i18n.t("groupChat");
};

/**
 * Conversations that are always present and always first: the app-level group,
 * and (see the chat list) the Topics entry. Pinning them means a member who has
 * only just been verified still finds both waiting at the top of an otherwise
 * empty list.
 */
export const isPinnedConversation = (conversation) => !!conversation?.appLevel;

/** Sort comparator: pinned first, then most recently active. */
export const compareConversations = (a, b) => {
  const pinnedA = isPinnedConversation(a);
  const pinnedB = isPinnedConversation(b);
  if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;

  // The server ships each conversation's newest message as `lastMessage`, so
  // ordering no longer depends on history having been loaded. Loaded history is
  // only the fallback for payloads that predate the field.
  const lastA = a.lastMessage || a.chatHistory?.[a.chatHistory.length - 1];
  const lastB = b.lastMessage || b.chatHistory?.[b.chatHistory.length - 1];

  // parseServerDate, not bare new Date(): the timestamp arrives space-separated
  // and zone-less, which Safari refuses to parse (NaN comparator = unsorted web
  // list) and which a bare parse reads in device-local time while rendering
  // reads it as UTC.
  const timeA = Math.max(
    lastA ? serverDateMillis(lastA.timestamp) : 0,
    a.updatedAt || 0
  );
  const timeB = Math.max(
    lastB ? serverDateMillis(lastB.timestamp) : 0,
    b.updatedAt || 0
  );

  return timeB - timeA;
};
