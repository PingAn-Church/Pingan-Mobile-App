// Emoji reactions on chat messages: the quick row, the palette behind its "+",
// and the little bit of arithmetic the optimistic update needs. Any single
// emoji is a reaction — the server checks that it is exactly one
// (MessageReactionService.isSingleEmoji). Keys are the canonical forms it
// stores; `displayEmoji` gives back what a keyboard would draw.

/** The canonical key for whatever form a tally or a keyboard produced. */
export const canonicalEmoji = (emoji) => String(emoji || "").replace(/️/g, "").trim();

/** The six on the long-press menu, in order. */
export const QUICK_REACTIONS = ["🙏", "❤", "👍", "😂", "🎉", "😢"];

/**
 * The rest, grouped the way a keyboard groups them; `labelKey` names the
 * heading's translation. Stored forms, so a pick matches a tally exactly.
 */
export const EMOJI_PALETTE = [
  {
    key: "faith",
    labelKey: "emojiFaith",
    emojis: ["🙏", "✝", "📖", "🕊", "⛪", "🙌", "🕯", "🎵", "🌟", "✨", "🌈", "🫶", "🤲", "💒", "🔔", "🐑"],
  },
  {
    key: "smileys",
    labelKey: "emojiSmileys",
    emojis: ["😀", "😂", "🤣", "😊", "😍", "🥰", "😘", "😎", "🤗", "🤔", "😅", "😢", "😭", "😮", "😡", "🥳", "😴", "🤩", "😇", "🙃", "😉", "😋", "🤭", "😬"],
  },
  {
    key: "gestures",
    labelKey: "emojiGestures",
    emojis: ["👍", "👎", "👏", "🙌", "🤝", "✌", "🤞", "👌", "💪", "🫡", "👋", "🤙", "☝", "👆", "👇", "✊"],
  },
  {
    key: "hearts",
    labelKey: "emojiHearts",
    emojis: ["❤", "🧡", "💛", "💚", "💙", "💜", "🤎", "🖤", "🤍", "💔", "❣", "💕", "💞", "💓", "💗", "💖"],
  },
  {
    key: "celebration",
    labelKey: "emojiCelebration",
    emojis: ["🎉", "🎊", "🎂", "🎁", "🥂", "🍰", "🏆", "🎈", "🎶", "💐", "🌹", "🌸", "🍀", "⭐", "🔥", "💯"],
  },
  {
    key: "nature",
    labelKey: "emojiNature",
    emojis: ["☀", "🌙", "🌧", "🌻", "🌿", "🍎", "☕", "🍞", "🐟", "🦋", "🐶", "🐱", "🏠", "🚗", "✈", "⏰"],
  },
].map((group) => ({ ...group, emojis: group.emojis.map(canonicalEmoji) }));

/**
 * What to draw for a stored emoji. The store drops the U+FE0F presentation
 * selector, which is what makes ❤, ✝ or ☀ come out as a coloured picture rather
 * than a text glyph on some keyboards — so a lone symbol gets it back, as does
 * the digit under a keycap. Sequences with skin tones or joiners draw as stored.
 */
export const displayEmoji = (emoji) => {
  const key = canonicalEmoji(emoji);
  if (!key) return String(emoji || "");
  const codePoints = Array.from(key);
  if (codePoints.length === 1) return key + "️";
  if (codePoints.length === 2 && codePoints[1] === "⃣") return codePoints[0] + "️⃣";
  return key;
};

/**
 * The tallies after the viewer toggles one emoji, for showing the result before
 * the server answers. Counts go up or down by one, an emoji nobody else used
 * disappears when the viewer withdraws, and a new one joins at the end — the
 * order the server keeps too (first reaction first).
 */
export const applyOwnReaction = (reactions, emoji, on) => {
  const key = canonicalEmoji(emoji);
  const current = Array.isArray(reactions) ? reactions : [];
  const existing = current.find((r) => canonicalEmoji(r?.emoji) === key);

  if (on) {
    if (existing?.mine) return current;
    return existing
      ? current.map((r) => (r === existing ? { ...r, count: Number(r.count || 0) + 1, mine: true } : r))
      : [...current, { emoji: key, count: 1, mine: true }];
  }
  if (!existing?.mine) return current;
  const count = Number(existing.count || 0) - 1;
  return count <= 0
    ? current.filter((r) => r !== existing)
    : current.map((r) => (r === existing ? { ...r, count, mine: false } : r));
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
