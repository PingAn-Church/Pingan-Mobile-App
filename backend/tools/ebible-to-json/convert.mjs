/**
 * eBible.org HTML → indexed JSON.
 *
 * One .htm per chapter, named {BOOKCODE}{NN}.htm. Verses are marked by
 * <span class="verse" id="Vn">n&#160;</span> and run until the next such span.
 *
 * The whole job is deciding, per element, between DELETE (drop the element AND
 * its text) and UNWRAP (drop the tag, keep the text). Getting one backwards
 * produces verses that read almost right, which is the worst possible outcome.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Protestant canon in order; index+1 is the book id used by [bible:...] tokens.
const BOOKS = [
  "GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI",
  "1CH","2CH","EZR","NEH","EST","JOB","PSA","PRO","ECC","SNG","ISA","JER",
  "LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP",
  "HAG","ZEC","MAL","MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL",
  "EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAS","1PE",
  "2PE","1JN","2JN","3JN","JUD","REV",
];
const BOOK_ID = new Map(BOOKS.map((code, i) => [code, i + 1]));

// DELETE: element and everything inside it.
//   notemark  - footnote; its <span class="popup"> holds the note TEXT inline,
//               so unwrapping splices editorial prose into the verse.
//   s / r / ms - section headings and cross-reference lines: not scripture.
//   chapterlabel, tnav, footnote, copyright - chrome.
const DELETE = [
  /<a\b[^>]*class="notemark"[^>]*>[\s\S]*?<\/a>/gi,
  /<div\b[^>]*class=['"](?:s\d?|r|ms\d?|mt\d?|toc\d?|d)['"][^>]*>[\s\S]*?<\/div>/gi,
  /<div\b[^>]*class=['"]chapterlabel['"][^>]*>[\s\S]*?<\/div>/gi,
  /<ul\b[^>]*class=['"]tnav['"][^>]*>[\s\S]*?<\/ul>/gi,
  /<div\b[^>]*class="footnote"[\s\S]*$/i,
  /<div\b[^>]*class="copyright"[\s\S]*$/i,
];

// Everything surviving that is UNWRAPPED: wj (words of Jesus), add (supplied
// words - the KJV's italics, part of the verse), pn (proper names), nd (divine
// name), and the p/q/m paragraph and poetry containers.

const ENTITIES = {
  "&nbsp;": " ", "&#160;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
  "&quot;": '"', "&apos;": "'", "&#8217;": "’", "&#8216;": "‘",
  "&#8212;": "—", "&#8211;": "–", "&#8220;": "“", "&#8221;": "”",
};

const clean = (html) => {
  let text = html.replace(/<[^>]+>/g, "");
  text = text.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  for (const [entity, ch] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(ch);
  }
  return text
    .replace(/¶/g, " ")           // pilcrow is a rendered paragraph mark
    .replace(/[ \t\r\n ]+/g, " ") // NB: keeps U+3000 (CUV reverence space)
    .trim();
};

const VERSE = /<span\b[^>]*class="verse"[^>]*>\s*(\d+)(?:[-–](\d+))?\s*(?:&#160;|&nbsp;|\s)*<\/span>/gi;

function parseChapter(html) {
  let body = html.slice(html.indexOf('<div class="main">'));
  for (const pattern of DELETE) body = body.replace(pattern, "");

  const marks = [];
  let m;
  VERSE.lastIndex = 0;
  while ((m = VERSE.exec(body)) !== null) {
    marks.push({
      from: Number(m[1]),
      to: m[2] ? Number(m[2]) : Number(m[1]),
      markStart: m.index,                 // where the NEXT verse's marker begins
      start: m.index + m[0].length,       // where THIS verse's text begins
    });
  }

  const verses = [];
  for (let i = 0; i < marks.length; i++) {
    // End at the next marker's START, not its end — otherwise the next verse's
    // printed number gets swept into this verse's text.
    const end = i + 1 < marks.length ? marks[i + 1].markStart : body.length;
    const text = clean(body.slice(marks[i].start, end));
    if (text) verses.push({ v: marks[i].from, vEnd: marks[i].to, t: text });
  }
  return verses;
}

function convert(dir, label) {
  const files = readdirSync(dir).filter((f) => /^[0-9A-Z]{3}\d{2,3}\.htm$/i.test(f));
  const rows = [];
  const skipped = new Set();

  for (const file of files.sort()) {
    const code = file.slice(0, 3).toUpperCase();
    const chapter = Number(file.slice(3).replace(/\.htm$/i, ""));
    const bookId = BOOK_ID.get(code);
    if (!bookId) { skipped.add(code); continue; }   // apocrypha / front matter
    if (chapter === 0) continue;                    // book intro pages

    for (const verse of parseChapter(readFileSync(join(dir, file), "utf8"))) {
      rows.push({ b: bookId, c: chapter, v: verse.v, t: verse.t,
                  ...(verse.vEnd !== verse.v ? { ve: verse.vEnd } : {}) });
    }
  }

  rows.sort((a, b) => a.b - b.b || a.c - b.c || a.v - b.v);
  console.log(`${label}: ${rows.length} verses, ${new Set(rows.map(r => r.b)).size} books` +
              (skipped.size ? `, skipped non-canon: ${[...skipped].sort().join(" ")}` : ""));
  return rows;
}

/**
 * Book names, taken from each book's index page title, which reads
 * "{edition} {book}" — "King James Version + Apocrypha Luke", "新标点和合本 路加福音".
 *
 * Sourced from the downloads rather than typed out, so the names match the editions
 * actually shipped. This is the ONLY place the Chinese names exist, so books.json has
 * to be generated before the HTML is deleted.
 */
function bookNames(dir, edition) {
  const names = new Map();
  for (const code of BOOKS) {
    let html;
    try {
      html = readFileSync(join(dir, `${code}.htm`), "utf8");
    } catch {
      continue;
    }
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    if (!title) continue;
    names.set(code, title.startsWith(edition) ? title.slice(edition.length).trim() : title);
  }
  return names;
}

function buildBooks(docs) {
  const en = bookNames(join(docs, "eng-kjv"), "King James Version + Apocrypha");
  const zh = bookNames(join(docs, "cmn-cu89s"), "新标点和合本");

  const books = BOOKS.map((code, i) => {
    const english = en.get(code) ?? code;
    const chinese = zh.get(code) ?? "";
    // Mechanical aliases only. Curated abbreviations ("Jn", "太") are a separate
    // reviewed pass — guessing 66 of them is how a lookup silently misroutes.
    const aliases = new Set([code, english, english.replace(/\s+/g, "")]);
    if (chinese) aliases.add(chinese);
    return { id: i + 1, code, en: english, zh: chinese, aliases: [...aliases] };
  });

  const missing = books.filter((b) => !b.en || !b.zh).map((b) => b.code);
  console.log(`\nbooks.json: ${books.length} books` +
              (missing.length ? `, MISSING NAMES: ${missing.join(" ")}` : ", all names resolved"));
  return books;
}

const docs = process.argv[2];
const out = process.argv[3];
const kjv = convert(join(docs, "eng-kjv"), "KJV");
const cuv = convert(join(docs, "cmn-cu89s"), "CUV");
writeFileSync(join(out, "kjv.json"), JSON.stringify(kjv));
writeFileSync(join(out, "cuv.json"), JSON.stringify(cuv));
writeFileSync(join(out, "books.json"), JSON.stringify(buildBooks(docs), null, 1));

const at = (rows, b, c, v) => rows.find((r) => r.b === b && r.c === c && r.v === v)?.t;
console.log("\nLuke 10:27 KJV:", at(kjv, 42, 10, 27));
console.log("Luke 10:27 CUV:", at(cuv, 42, 10, 27));
console.log("\nJohn 3:16 KJV:", at(kjv, 43, 3, 16));
console.log("John 3:16 CUV:", at(cuv, 43, 3, 16));
console.log("\n[add kept]   Luke 10:2 KJV:", at(kjv, 42, 10, 2)?.slice(0, 60));
console.log("[note gone]  Luke 10:6 CUV:", at(cuv, 42, 10, 6));
console.log("[note gone]  Gen 4:1 KJV:", at(kjv, 1, 4, 1));
