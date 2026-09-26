// Emoji reactions on chat messages: the fixed set and the little bit of
// arithmetic the optimistic update needs. The server is the twin of this file
// (MessageReactionService.ALLOWED); keys are the canonical forms it stores,
// `display` is what the keyboard-style glyph looks like on screen.

export const REACTION_EMOJIS = [
  { key: "🙏", display: "🙏" },
  { key: "❤", display: "❤️" },
  { key: "👍", display: "👍" },
];

const DISPLAY_BY_KEY = Object.fromEntries(REACTION_EMOJIS.map((e) => [e.key, e.display]));

/** The canonical key for whatever form a tally or a keyboard produced. */
export const canonicalEmoji = (emoji) => String(emoji || "").replace(/️/g, "").trim();

export const displayEmoji = (emoji) => DISPLAY_BY_KEY[canonicalEmoji(emoji)] || String(emoji || "");

/**
 * The tallies after the viewer toggles one emoji, for showing the result before
 * the server answers. Counts go up or down by one, an emoji nobody else used
 * disappears when the viewer withdraws, and the fixed display order is kept.
 */
export const applyOwnReaction = (reactions, emoji, on) => {
  const key = canonicalEmoji(emoji);
  const current = Array.isArray(reactions) ? reactions : [];
  const existing = current.find((r) => canonicalEmoji(r?.emoji) === key);

  let next;
  if (on) {
    if (existing?.mine) return current;
    next = existing
      ? current.map((r) => (r === existing ? { ...r, count: Number(r.count || 0) + 1, mine: true } : r))
      : [...current, { emoji: key, count: 1, mine: true }];
  } else {
    if (!existing?.mine) return current;
    const count = Number(existing.count || 0) - 1;
    next =
      count <= 0
        ? current.filter((r) => r !== existing)
        : current.map((r) => (r === existing ? { ...r, count, mine: false } : r));
  }

  const order = REACTION_EMOJIS.map((e) => e.key);
  return [...next].sort((a, b) => order.indexOf(canonicalEmoji(a.emoji)) - order.indexOf(canonicalEmoji(b.emoji)));
};

/**
 * Merges a re-broadcast's tallies into what this device already shows. One
 * broadcast reaches everyone, so it cannot say which reactions are yours
 * (`mine` arrives null); what this device knew about its own stands.
 */
export const mergeReactions = (existing, incoming) => {
  if (!Array.isArray(incoming)) return Array.isArray(existing) ? existing : [];
  const known = Array.isArray(existing) ? existing : [];
  return incoming.map((r) => {
    if (r?.mine === true || r?.mine === false) return r;
    const before = known.find((e) => canonicalEmoji(e?.emoji) === canonicalEmoji(r?.emoji));
    return { ...r, mine: !!before?.mine };
  });
};
