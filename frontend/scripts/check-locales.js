#!/usr/bin/env node
/**
 * CI guard for i18n: every locale file must be valid JSON and the locales must
 * share the exact same key set, so a string added to one language can't silently
 * ship missing in another. Run from the frontend dir: `node scripts/check-locales.js`.
 */
const fs = require("fs");
const path = require("path");

const localesDir = path.join(__dirname, "..", "src", "locales");
const files = ["en.json", "zh.json"];

const loaded = {};
for (const file of files) {
  const full = path.join(localesDir, file);
  let raw;
  try {
    raw = fs.readFileSync(full, "utf8");
  } catch (e) {
    console.error(`✗ ${file}: cannot read — ${e.message}`);
    process.exit(1);
  }
  try {
    loaded[file] = JSON.parse(raw);
  } catch (e) {
    console.error(`✗ ${file}: invalid JSON — ${e.message}`);
    process.exit(1);
  }
}

const [base, ...others] = files;
const baseKeys = Object.keys(loaded[base]);
let ok = true;

for (const other of others) {
  const otherKeys = Object.keys(loaded[other]);
  const missingInOther = baseKeys.filter((k) => !(k in loaded[other]));
  const missingInBase = otherKeys.filter((k) => !(k in loaded[base]));

  if (missingInOther.length) {
    ok = false;
    console.error(`✗ keys present in ${base} but missing from ${other}: ${missingInOther.join(", ")}`);
  }
  if (missingInBase.length) {
    ok = false;
    console.error(`✗ keys present in ${other} but missing from ${base}: ${missingInBase.join(", ")}`);
  }
}

if (!ok) {
  process.exit(1);
}

console.log(`✓ locales valid and in parity (${baseKeys.length} keys across ${files.length} files)`);
