/**
 * Lite inline markup: the few markers people already type into WhatsApp and
 * that the assistant is told to use, and nothing more.
 *
 *   *bold*    or  **bold**
 *   _italic_  or  __italic__
 *   ~struck~  or  ~~struck~~
 *
 * This is deliberately not Markdown. No headings, lists, links, code or
 * escaping — three markers, matched loosely, drawn as nested <Text>. Text is
 * stored exactly as typed; the only thing decided here is how it is drawn, so
 * copy, edit and search all see the original.
 *
 * What keeps ordinary text from lighting up by accident:
 *   - an opening marker cannot follow a Latin letter or digit, so snake_case,
 *     5*3*2 and file_v2_final stay as they are — while Chinese, which has no
 *     spaces, still works: 我觉得*很好*呢
 *   - the character just inside a marker cannot be a space: "a * b" is maths
 *   - a closing marker must be the same length as its opener and cannot be
 *     followed by a Latin letter or digit
 *   - nothing spans a line break, and a run of three or more is never a marker
 *   - a marker that never finds its partner is printed as typed
 *
 * The server keeps the same rules for push-notification text
 * (backend .../util/InlineMarkup.java). Change both together.
 */

const KIND = { "*": "bold", _: "italic", "~": "strike" };
const LATIN = /[A-Za-z0-9À-ɏ]/;
const SPACE = /\s/;
const ANY_MARKER = /[*_~]/;

const plain = (text) => ({ text, bold: false, italic: false, strike: false });

/**
 * Splits text into spans: [{ text, bold, italic, strike }]. Adjacent spans
 * always differ in at least one flag, and the texts joined together give back
 * the original minus the markers that were honoured.
 */
export function parseInlineMarkup(input) {
  const text = input == null ? "" : String(input);
  if (!text) return [];
  if (!ANY_MARKER.test(text)) return [plain(text)];
  return fold(tokenize(text));
}

/** The same text with every honoured marker removed — for previews and pushes. */
export function stripInlineMarkup(input) {
  return parseInlineMarkup(input)
    .map((span) => span.text)
    .join("");
}

/**
 * One pass over the text producing text tokens and marker tokens. A marker
 * starts out "pending"; it becomes "open" when a matching closer turns up and
 * "literal" if a line break or the end of the text arrives first.
 */
function tokenize(text) {
  const tokens = [];
  const pending = [];
  let literalStart = 0;

  const flushText = (end) => {
    if (end > literalStart) tokens.push({ text: text.slice(literalStart, end) });
  };
  const abandon = () => {
    while (pending.length) pending.pop().role = "literal";
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "\n") {
      abandon();
      i += 1;
      continue;
    }
    if (!KIND[c]) {
      i += 1;
      continue;
    }

    let n = 1;
    while (text[i + n] === c) n += 1;
    if (n > 2) {
      i += n; // *** and longer are decoration, never markup
      continue;
    }

    const prev = i > 0 ? text[i - 1] : "";
    const next = i + n < text.length ? text[i + n] : "";
    const canClose = prev !== "" && !SPACE.test(prev) && (next === "" || !LATIN.test(next));
    const canOpen = next !== "" && !SPACE.test(next) && (prev === "" || !LATIN.test(prev));
    const top = pending[pending.length - 1];

    if (canClose && top && top.marker === c && top.n === n) {
      flushText(i);
      tokens.push({ marker: c, n, role: "close" });
      top.role = "open";
      pending.pop();
      literalStart = i + n;
    } else if (canOpen) {
      flushText(i);
      const token = { marker: c, n, role: "pending" };
      tokens.push(token);
      pending.push(token);
      literalStart = i + n;
    }
    i += n;
  }

  flushText(text.length);
  abandon();
  return tokens;
}

/** Turns the token stream into styled spans, restoring unmatched markers as text. */
function fold(tokens) {
  const spans = [];
  const depth = { bold: 0, italic: 0, strike: 0 };

  const emit = (piece) => {
    if (!piece) return;
    const bold = depth.bold > 0;
    const italic = depth.italic > 0;
    const strike = depth.strike > 0;
    const last = spans[spans.length - 1];
    if (last && last.bold === bold && last.italic === italic && last.strike === strike) {
      last.text += piece;
    } else {
      spans.push({ text: piece, bold, italic, strike });
    }
  };

  for (const token of tokens) {
    if (token.text !== undefined) {
      emit(token.text);
      continue;
    }
    const kind = KIND[token.marker];
    if (token.role === "open") depth[kind] += 1;
    else if (token.role === "close") depth[kind] -= 1;
    else emit(token.marker.repeat(token.n));
  }
  return spans;
}
