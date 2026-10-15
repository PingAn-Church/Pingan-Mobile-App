#!/usr/bin/env node
/**
 * CI guard for link detection (src/utils/links.js): the addresses that must be
 * found, the ordinary text that must not, and how links and the lite markup
 * share a line. The project has no test runner, so this is plain Node. Run
 * from the frontend dir: `node scripts/check-links.mjs`.
 */
import { findLinks, parseMarkupAndLinks, splitOnLinks } from "../src/utils/links.js";

let failed = 0;
const fail = (label, input, expected, actual) => {
  failed += 1;
  console.error(
    `FAIL ${label} ${JSON.stringify(input)}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`
  );
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// [input, [[text as typed, url to open], ...]]
const links = [
  // ── found ────────────────────────────────────────────────────────────────
  ["https://example.com", [["https://example.com", "https://example.com"]]],
  ["http://example.com/a?b=1&c=2", [["http://example.com/a?b=1&c=2", "http://example.com/a?b=1&c=2"]]],
  ["see example.com now", [["example.com", "https://example.com"]]],
  ["www.example.com/path?q=1.", [["www.example.com/path?q=1", "https://www.example.com/path?q=1"]]],
  ["(https://example.com/a_(b))", [["https://example.com/a_(b)", "https://example.com/a_(b)"]]],
  ["Visit https://x.com!", [["https://x.com", "https://x.com"]]],
  ["x.com\nhttps://y.com", [["x.com", "https://x.com"], ["https://y.com", "https://y.com"]]],
  ["a.com and b.org", [["a.com", "https://a.com"], ["b.org", "https://b.org"]]],
  ["bible.church", [["bible.church", "https://bible.church"]]],
  ["http://localhost:3000/x", [["http://localhost:3000/x", "http://localhost:3000/x"]]],
  // Chinese, Japanese, Korean and emoji sit right against a link, as typed
  ["点这里https://example.com，谢谢", [["https://example.com", "https://example.com"]]],
  ["我在baidu.com看到", [["baidu.com", "https://baidu.com"]]],
  ["“https://x.com”", [["https://x.com", "https://x.com"]]],
  ["🙏https://example.com", [["https://example.com", "https://example.com"]]],
  ["look👉example.com", [["example.com", "https://example.com"]]],
  ["リンクはexample.comです", [["example.com", "https://example.com"]]],
  ["링크example.com입니다", [["example.com", "https://example.com"]]],
  // The link ends where Chinese begins: an address with Chinese in its path is cut short
  ["https://x.com/path?q=中文", [["https://x.com/path?q=", "https://x.com/path?q="]]],

  // ── not links ────────────────────────────────────────────────────────────
  ["版本 1.2.0 已发布", []],
  ["file.js and index.html", []],
  ["e.g. this, i.e. that", []],
  ["test@example.com", []],
  ["mailto:someone@example.com", []],
  ["ftp://host.com/file", []],
  ["3.5 out of 5", []],
  ["Mr. Smith", []],
  ["John.", []],
  ["plain words", []],
  ["", []],
  [null, []],
  [undefined, []],
];
for (const [input, expected] of links) {
  const found = findLinks(input);
  const actual = found.map((link) => [link.text, link.url]);
  if (!same(actual, expected)) fail("findLinks", input, expected, actual);
  // A link's text is the characters at its own indices, untouched.
  for (const link of found) {
    const sliced = String(input).slice(link.index, link.lastIndex);
    if (sliced !== link.text) fail("findLinks indices", input, link.text, sliced);
  }
}

const splits = [
  ["see x.com now", [{ text: "see " }, { text: "x.com", url: "https://x.com" }, { text: " now" }]],
  ["x.com", [{ text: "x.com", url: "https://x.com" }]],
  ["plain", [{ text: "plain" }]],
  ["", [{ text: "" }]],
  [null, [{ text: "" }]],
];
for (const [input, expected] of splits) {
  const actual = splitOnLinks(input);
  if (!same(actual, expected)) fail("splitOnLinks", input, expected, actual);
}

const B = { bold: true }, I = { italic: true };
const span = (text, flags = {}, url) => ({
  text, bold: false, italic: false, strike: false, ...flags, ...(url ? { url } : {}),
});
const rich = [
  // a link's own characters are never markers
  ["https://a.com/_x_", [span("https://a.com/_x_", {}, "https://a.com/_x_")]],
  ["a.com/x_y_z and _italic_", [span("a.com/x_y_z", {}, "https://a.com/x_y_z"), span(" and "), span("italic", I)]],
  // markup around a link applies to it
  ["*see https://a.com/x_y_z now*", [span("see ", B), span("https://a.com/x_y_z", B, "https://a.com/x_y_z"), span(" now", B)]],
  ["see *x.com* now", [span("see "), span("x.com", B, "https://x.com"), span(" now")]],
  ["a.com *b.com*", [span("a.com", {}, "https://a.com"), span(" "), span("b.com", B, "https://b.com")]],
  // a lone marker between two links is printed as typed
  ["a.com*b.com", [span("a.com", {}, "https://a.com"), span("*"), span("b.com", {}, "https://b.com")]],
  // no links: exactly what parseInlineMarkup gives
  ["no links *here*", [span("no links "), span("here", B)]],
  [" x.com", [span(" x.com")]],
  ["", []],
  [null, []],
];
for (const [input, expected] of rich) {
  const actual = parseMarkupAndLinks(input);
  if (!same(actual, expected)) fail("parseMarkupAndLinks", input, expected, actual);
}

// Round trip: joined back together the spans give the original minus honoured
// markers — no character dropped or invented, whatever the links do.
for (const [input] of [...rich, ...links]) {
  const source = input == null ? "" : String(input);
  const joined = parseMarkupAndLinks(source).map((s) => s.text).join("");
  const nonMarkersIn = source.replace(/[*_~]/g, "");
  const nonMarkersOut = joined.replace(/[*_~]/g, "");
  const markersIn = source.replace(/[^*_~]/g, "").length;
  const markersOut = joined.replace(/[^*_~]/g, "").length;
  if (nonMarkersIn !== nonMarkersOut || markersOut > markersIn) fail("round-trip", input, source, joined);
}

if (failed) {
  console.error(`\n${failed} link check(s) failed.`);
  process.exit(1);
}
console.log(`links: ${links.length} detection cases, ${splits.length} split cases, ${rich.length} markup cases OK`);
