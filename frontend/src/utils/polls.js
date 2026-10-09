import i18n from "../../i18n";

// Polls and sign-up sheets in chat: the little that is shared between the card,
// the composer and the message merge in ChatContext.

export const POLL_SINGLE = "SINGLE";
export const POLL_MULTI = "MULTI";
export const POLL_SIGNUP = "SIGNUP";

export const pollModeLabel = (mode) => {
  if (mode === POLL_MULTI) return i18n.t("pollMulti");
  if (mode === POLL_SIGNUP) return i18n.t("pollSignup");
  return i18n.t("pollSingle");
};

/**
 * Merges a re-broadcast poll into what this device already shows. One broadcast
 * reaches everyone, so it cannot say which choices are yours (`myOptionIds`
 * arrives null); what this device knew stands. A message update that carries no
 * poll at all (a reaction tally, an edit) leaves the poll alone.
 */
export const mergePoll = (existing, incoming) => {
  if (!incoming) return existing || null;
  return {
    ...incoming,
    myOptionIds: Array.isArray(incoming.myOptionIds)
      ? incoming.myOptionIds
      : Array.isArray(existing?.myOptionIds)
        ? existing.myOptionIds
        : [],
  };
};

/** "Closes 4 Oct, 10:00" style stamp for a deadline in epoch ms. */
export const formatDeadline = (deadlineMs, language) => {
  if (!deadlineMs) return "";
  try {
    return new Intl.DateTimeFormat(String(language || "").startsWith("zh") ? "zh-CN" : "en-GB", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(Number(deadlineMs)));
  } catch (error) {
    return new Date(Number(deadlineMs)).toLocaleString();
  }
};
