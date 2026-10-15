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
 * Conversations that sit above the rest: the app-level group, which is always
 * present and always first (a member verified a minute ago still finds it, and
 * the Topics entry under it, at the top of an otherwise empty list), and
 * whatever the reader pinned there themselves.
 */
export const isPinnedConversation = (conversation) =>
  !!conversation?.appLevel || !!conversation?.pinned;

/**
 * Sort comparator: the app-level group, then what the reader pinned (the most
 * recently pinned highest), then everything else by most recent activity.
 */
export const compareConversations = (a, b) => {
  if (!!a?.appLevel !== !!b?.appLevel) return a?.appLevel ? -1 : 1;
  const pinnedA = !!a?.pinned;
  const pinnedB = !!b?.pinned;
  if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;
  if (pinnedA) {
    const byPin = (b.pinnedAt || 0) - (a.pinnedAt || 0);
    if (byPin) return byPin;
  }

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
