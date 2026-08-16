import i18n from "../../i18n";

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

  const lastA = a.chatHistory?.[a.chatHistory.length - 1];
  const lastB = b.chatHistory?.[b.chatHistory.length - 1];

  const timeA = Math.max(
    lastA ? new Date(lastA.timestamp).getTime() : 0,
    a.updatedAt || 0
  );
  const timeB = Math.max(
    lastB ? new Date(lastB.timestamp).getTime() : 0,
    b.updatedAt || 0
  );

  return timeB - timeA;
};
