/**
 * Where the links are in a piece of chat text, so they can be drawn tappable
 * and opened in the phone's browser. Detection only: nothing here touches
 * React Native, so the same code runs under plain Node for the CI check
 * (scripts/check-links.mjs).
 *
 * What counts as a link:
 *   - http:// and https:// addresses
 *   - bare domains with a known top-level domain: example.com, www.site.org,
 *     bible.church — but not file.js, 1.2.0 or e.g.
 *   - nothing else: no emails, no ftp, no phone numbers
 *
 * Trailing punctuation stays outside ("see x.com." links x.com) and brackets
 * are balanced ("(x.com/a_(b))" keeps the inner pair). Chinese, Japanese,
 * Korean and emoji may sit right against a link with no space — 点这里x.com，
 * 🙏https://x.com — because people type that way; the link ends where such
 * text begins, so an address with Chinese in its path is cut short there.
 *
 * Text is stored exactly as typed; only how it is drawn is decided here.
 */
import { LinkifyIt } from "linkify-it";
import { parseInlineMarkup } from "./inlineMarkup.js";

// Top-level domains beyond linkify-it's defaults (every two-letter code plus
// com/org/net/info/...) that people here are likely to paste.
const EXTRA_TLDS = [
  "app", "dev", "page", "site", "online", "website", "link", "live", "life",
  "cloud", "store", "tech", "news", "blog", "video", "wiki", "church", "faith",
  "bible", "xyz", "top", "vip", "club", "wang", "icu",
];

const linkify = new LinkifyIt({ fuzzyLink: true, fuzzyEmail: false, fuzzyIP: false })
  .add("ftp:", null)
  .add("//", null)
  .add("mailto:", null)
  .tlds(EXTRA_TLDS, true);

// Characters linkify-it would read as part of a word but which here end or
// start one: CJK ideographs, Japanese and Korean syllables, and emoji (the
// symbol blocks, the surrogate pairs, and the joiner and variation selector
// that glue them together). Each is swapped for a space of the same length
// before matching, so the indices found apply to the original text as is.
const WORD_BREAKERS =
  /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯☀-➿⬀-⯿‍️]|[\ud83c-\ud83e][\udc00-\udfff]/g;

const probeOf = (text) => text.replace(WORD_BREAKERS, (run) => " ".repeat(run.length));

/**
 * Every link in the text, in order: [{ index, lastIndex, text, url }]. `text`
 * is the characters as typed; `url` is what to open — a bare domain gets https://.
 */
export function findLinks(input) {
  const text = input == null ? "" : String(input);
  if (!text) return [];
  const matches = linkify.match(probeOf(text));
  if (!matches) return [];
  return matches.map((match) => {
    const raw = text.slice(match.index, match.lastIndex);
    return {
      index: match.index,
      lastIndex: match.lastIndex,
      text: raw,
      url: match.schema ? raw : `https://${raw}`,
    };
  });
}

/** The text in order as plain runs and link runs: [{ text }, { text, url }, …]. */
export function splitOnLinks(input) {
  const text = input == null ? "" : String(input);
  const links = findLinks(text);
  if (!links.length) return [{ text }];

  const parts = [];
  let cursor = 0;
  for (const link of links) {
    if (link.index > cursor) parts.push({ text: text.slice(cursor, link.index) });
    parts.push({ text: link.text, url: link.url });
    cursor = link.lastIndex;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

// Stands in for a link's characters while the markup is parsed. A private-use
// character, so it never occurs in what people type; if it somehow does, the
// text is drawn with its markup and no links rather than guessed at.
const MASK = "";
const MASK_RUNS = /+/g;

/**
 * Markup spans with the links lifted out first:
 * [{ text, bold, italic, strike, url? }]. A link's own characters are never
 * read as markers — https://a.com/_x_ is not italic — while markup around a
 * link still applies: *see a.com now* is bold throughout, link included.
 * Joined back together the texts give the original minus the honoured
 * markers, as parseInlineMarkup promises.
 */
export function parseMarkupAndLinks(input) {
  const text = input == null ? "" : String(input);
  const links = findLinks(text);
  if (!links.length || text.includes(MASK)) return parseInlineMarkup(text);

  let masked = "";
  let cursor = 0;
  for (const link of links) {
    masked += text.slice(cursor, link.index) + MASK.repeat(link.lastIndex - link.index);
    cursor = link.lastIndex;
  }
  masked += text.slice(cursor);

  const spans = [];
  let next = 0;
  for (const span of parseInlineMarkup(masked)) {
    let last = 0;
    let run;
    MASK_RUNS.lastIndex = 0;
    while ((run = MASK_RUNS.exec(span.text)) !== null) {
      if (run.index > last) spans.push({ ...span, text: span.text.slice(last, run.index) });
      // One run is one link, unless the markers that separated two links were
      // honoured and taken out — so a run is handed out link by link.
      let remaining = run[0].length;
      while (remaining > 0 && next < links.length) {
        const link = links[next];
        next += 1;
        spans.push({ ...span, text: link.text, url: link.url });
        remaining -= link.lastIndex - link.index;
      }
      last = run.index + run[0].length;
    }
    if (last < span.text.length) spans.push({ ...span, text: span.text.slice(last) });
  }
  return spans;
}
