#!/usr/bin/env node
/**
 * Update the Android in-app-update download links + release message that the
 * backend serves from application.properties (app.update.android.*).
 *
 * The app picks the link per device: China-based devices get the China mirror,
 * everyone else gets the international (Google) link. This script sets those two
 * URLs and the "what's new" message shown in the update dialog.
 *
 * npm strips flags from `npm run <script> ...` unless separated by `--`, so pass
 * the flags AFTER a `--`:
 *
 *   npm run dir-link -- -g https://drive.google.com/…   # international / Google
 *                       -c https://pan.example.cn/app    # China mirror
 *                       -p 518c                          # China-mirror password
 *                       -m "Bug fixes and speed-ups"     # update message (en+zh)
 *
 * Flags (all optional; omitted ones are left unchanged):
 *   --google,   -g  <https url>   international download page (non-China devices)
 *   --china,    -c  <https url>   China-mirror download page (China devices)
 *   --password, -p  <text>        China-mirror share password, shown in a prompt
 *                                 before redirecting (pass "" to clear it)
 *   --message,  -m  <text>        "what's new" text shown in the update dialog
 *
 * This only edits backend/src/main/resources/application.properties — it does
 * NOT create a git commit, and the backend must restart for new values to apply.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const backendPropertiesPath = path.resolve(
  root,
  "..",
  "backend",
  "src",
  "main",
  "resources",
  "application.properties"
);

// Direct-channel download pages (China distribution never uses the Play channel).
const GOOGLE_URL = /(app\.update\.android\.direct\.download-page-url=).*/g;
const CHINA_URL = /(app\.update\.android\.direct\.download-page-url-cn=).*/g;
const CHINA_PASSWORD = /(app\.update\.android\.direct\.download-password-cn=).*/g;
// Release notes exist per channel (direct + play) and language (en + zh) = 4.
const RELEASE_NOTES = /(app\.update\.android\.(?:direct|play)\.release-notes\.(?:en|zh)=).*/g;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function replaceExpected(raw, regex, replacement, label, expectedCount) {
  const matches = raw.match(regex) || [];
  if (matches.length !== expectedCount) {
    fail(`Expected ${expectedCount} ${label}, found ${matches.length}.`);
  }
  return raw.replace(regex, replacement);
}

// Spring Boot reads .properties as ISO-8859-1, so non-ASCII (e.g. Chinese) must
// be stored as \uXXXX escapes or it becomes mojibake. Encode per UTF-16 unit
// (astral chars become two escapes, which is exactly what Java expects).
const toPropsAscii = (s) =>
  s.replace(/[^\x00-\x7F]/g, (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));

// Escape `$` so values aren't read as replacement patterns ($1, $&, ...).
const esc = (s) => s.replace(/\$/g, "$$$$");

// A value ready to drop into a .properties line via String.replace.
const propVal = (s) => esc(toPropsAscii(s));

// --- parse flags (pass them after `--`; see header) -------------------------
const rawArgs = process.argv.slice(2).filter((a) => a && a !== "--");

let china = null;
let google = null;
let password = null;
let message = null;
const unexpected = [];

for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === "-c" || a === "--china") china = (rawArgs[++i] ?? "").trim();
  else if (a.startsWith("--china=")) china = a.slice("--china=".length).trim();
  else if (a.startsWith("-c=")) china = a.slice(3).trim();
  else if (a === "-g" || a === "--google") google = (rawArgs[++i] ?? "").trim();
  else if (a.startsWith("--google=")) google = a.slice("--google=".length).trim();
  else if (a.startsWith("-g=")) google = a.slice(3).trim();
  else if (a === "-m" || a === "--message") message = rawArgs[++i] ?? "";
  else if (a.startsWith("--message=")) message = a.slice("--message=".length);
  else if (a.startsWith("-m=")) message = a.slice(3);
  else if (a === "-p" || a === "--password") password = (rawArgs[++i] ?? "").trim();
  else if (a.startsWith("--password=")) password = a.slice("--password=".length).trim();
  else if (a.startsWith("-p=")) password = a.slice(3).trim();
  else unexpected.push(a);
}

if (unexpected.length) {
  fail(
    `Unexpected arg(s): ${unexpected.join(", ")}. Pass flags after \`--\`, e.g.\n` +
      '  npm run dir-link -- -g <https url> -c <https url> -m "message"'
  );
}
if (china === null && google === null && message === null && password === null) {
  fail(
    "Nothing to do. Usage (note the `--`):\n" +
      '  npm run dir-link -- -g <https google url> -c <https china url> -p <password> -m "update message"'
  );
}
if (google !== null && !/^https:\/\//i.test(google)) fail("--google/-g must be an https URL.");
if (china !== null && !/^https:\/\//i.test(china)) fail("--china/-c must be an https URL.");
if (password !== null && password.includes("\n")) fail("--password/-p must be a single line.");
if (message !== null && message.includes("\n")) fail("--message/-m must be a single line.");

if (!fs.existsSync(backendPropertiesPath)) {
  fail(`Backend properties not found at ${backendPropertiesPath}`);
}

let props = fs.readFileSync(backendPropertiesPath, "utf8");

if (google !== null) {
  props = replaceExpected(props, GOOGLE_URL, `$1${propVal(google)}`, "direct download-page-url (Google/international)", 1);
}
if (china !== null) {
  props = replaceExpected(props, CHINA_URL, `$1${propVal(china)}`, "direct download-page-url-cn (China mirror)", 1);
}
if (password !== null) {
  props = replaceExpected(props, CHINA_PASSWORD, `$1${propVal(password)}`, "direct download-password-cn (China mirror password)", 1);
}
if (message !== null) {
  props = replaceExpected(props, RELEASE_NOTES, `$1${propVal(message)}`, "release-notes entries (direct+play, en+zh)", 4);
}

fs.writeFileSync(backendPropertiesPath, props);

console.log("✓ updated backend app-update download links / message:");
if (google !== null) console.log(`  google  → ${google}`);
if (china !== null) console.log(`  china   → ${china}`);
if (password !== null) console.log(`  password → ${password || "(cleared)"}`);
if (message !== null) console.log(`  message → ${message}`);
console.log("Redeploy/restart the backend for the new values to take effect.");
