#!/usr/bin/env node
/**
 * CI guard for the lite inline markup (src/utils/inlineMarkup.js): the cases
 * that must render, and — more importantly — the ordinary text that must not.
 * The project has no test runner, so this is plain Node. Run from the frontend
 * dir: `node scripts/check-inline-markup.mjs`.
 *
 * The server keeps the same rules in InlineMarkupTest.java. Add cases to both.
 */
import { parseInlineMarkup, stripInlineMarkup } from "../src/utils/inlineMarkup.js";

const B = { bold: true }, I = { italic: true }, S = { strike: true };
const span = (text, flags = {}) => ({ text, bold: false, italic: false, strike: false, ...flags });

const cases = [
  // ── renders ──────────────────────────────────────────────────────────────
  ["**bold**", [span("bold", B)]],
  ["*bold*", [span("bold", B)]],
  ["_italic_", [span("italic", I)]],
  ["__italic__", [span("italic", I)]],
  ["~struck~", [span("struck", S)]],
  ["~~struck~~", [span("struck", S)]],
  ["see **this** now", [span("see "), span("this", B), span(" now")]],
  ["**bold** and _italic_", [span("bold", B), span(" and "), span("italic", I)]],
  ["**bold _both_ bold**", [span("bold ", B), span("both", { ...B, ...I }), span(" bold", B)]],
  ["_italic **both** italic_", [span("italic ", I), span("both", { ...B, ...I }), span(" italic", I)]],
  ["(**bold**)", [span("("), span("bold", B), span(")")]],
  ["**bold**, then", [span("bold", B), span(", then")]],
  ["**bold**.", [span("bold", B), span(".")]],
  ["\"*quoted*\"", [span("\""), span("quoted", B), span("\"")]],
  ["*3 apples*", [span("3 apples", B)]],
  ["**多个字**", [span("多个字", B)]],
  ["我觉得*很好*呢", [span("我觉得"), span("很好", B), span("呢")]],
  ["主说：**你们要彼此相爱**。", [span("主说："), span("你们要彼此相爱", B), span("。")]],
  ["line one **b**\nline two _i_", [span("line one "), span("b", B), span("\nline two "), span("i", I)]],
  ["**bold**\n", [span("bold", B), span("\n")]],
  ["emoji 🙏 **bold** 🙏", [span("emoji 🙏 "), span("bold", B), span(" 🙏")]],
  ["@Someone *hi*", [span("@Someone "), span("hi", B)]],
  ["**a** **b**", [span("a", B), span(" "), span("b", B)]],
  // Renders on purpose: the closer is followed by punctuation, which has to be
  // allowed for "**bold**." — WhatsApp draws _init_ the same way.
  ["__init__.py", [span("init", I), span(".py")]],

  // ── must stay exactly as typed ───────────────────────────────────────────
  ["snake_case_name", [span("snake_case_name")]],
  ["file_v2_final", [span("file_v2_final")]],
  ["5*3*2", [span("5*3*2")]],
  ["2 * 3 * 4", [span("2 * 3 * 4")]],
  ["a * b", [span("a * b")]],
  ["price: $5*", [span("price: $5*")]],
  ["*not bold", [span("*not bold")]],
  ["not bold*", [span("not bold*")]],
  ["** not bold **", [span("** not bold **")]],
  ["*mismatched**", [span("*mismatched**")]],
  ["**mismatched*", [span("**mismatched*")]],
  ["***", [span("***")]],
  ["****", [span("****")]],
  ["***decorated***", [span("***decorated***")]],
  ["~ approx", [span("~ approx")]],
  ["~/Documents", [span("~/Documents")]],
  ["about ~50 people", [span("about ~50 people")]],
  ["**never\ncloses**", [span("**never\ncloses**")]],
  ["a*b*c", [span("a*b*c")]],
  ["*a*b", [span("*a*b")]],
  ["h_e_l_l_o", [span("h_e_l_l_o")]],
  ["x_1 + x_2", [span("x_1 + x_2")]],
  ["", []],
  ["plain text", [span("plain text")]],
  ["**", [span("**")]],
  ["*", [span("*")]],
];

let failed = 0;
for (const [input, expected] of cases) {
  const actual = parseInlineMarkup(input);
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${JSON.stringify(input)}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  }
}

const strips = [
  ["**bold** and _italic_ and ~gone~", "bold and italic and gone"],
  ["snake_case 5*3*2 *unclosed", "snake_case 5*3*2 *unclosed"],
  [null, ""],
  [undefined, ""],
  [42, "42"],
];
for (const [input, expected] of strips) {
  const actual = stripInlineMarkup(input);
  if (actual !== expected) {
    failed += 1;
    console.error(`FAIL strip ${JSON.stringify(input)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Round trip: for every input, joining the spans back gives the original
// minus honoured markers — so no character is ever dropped or invented.
for (const [input] of cases) {
  const joined = parseInlineMarkup(input).map((s) => s.text).join("");
  const markersOnly = input.replace(/[^*_~]/g, "");
  const joinedMarkers = joined.replace(/[^*_~]/g, "");
  const nonMarkersIn = input.replace(/[*_~]/g, "");
  const nonMarkersOut = joined.replace(/[*_~]/g, "");
  if (nonMarkersIn !== nonMarkersOut || joinedMarkers.length > markersOnly.length) {
    failed += 1;
    console.error(`FAIL round-trip ${JSON.stringify(input)} -> ${JSON.stringify(joined)}`);
  }
}

if (failed) {
  console.error(`\n${failed} inline markup check(s) failed.`);
  process.exit(1);
}
console.log(`inline markup: ${cases.length} parse cases, ${strips.length} strip cases OK`);
