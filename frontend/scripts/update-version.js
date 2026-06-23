#!/usr/bin/env node
/**
 * Bump the app version in BOTH app.config.js and package.json in one step.
 *
 * `npm version <type>` only updates package.json, but for an Expo app the real
 * version is `expo.version` in app.config.js (it becomes iOS
 * CFBundleShortVersionString / Android versionName). package.json's version is
 * vestigial here, so the two drift apart. This keeps them in lockstep, using
 * app.config.js as the source of truth and mirroring package.json to it.
 *
 *   npm run update patch     # 0.1.2 -> 0.1.3
 *   npm run update minor     # 0.1.2 -> 0.2.0
 *   npm run update major     # 0.1.2 -> 1.0.0
 *   npm run update 1.4.0     # set an explicit version
 *
 * (If your npm doesn't forward the arg, use: npm run update -- patch)
 *
 * This only edits the two files — it does NOT create a git commit or tag.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const cfgPath = path.join(root, "app.config.js");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const CFG_VERSION = /(version:\s*)(["'])(\d+\.\d+\.\d+)\2/; // expo.version in app.config.js
const PKG_VERSION = /("version":\s*")\d+\.\d+\.\d+(")/; // first match = package's own version

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function nextVersion(current, type) {
  const m = SEMVER.exec(current);
  if (!m) throw new Error(`Current version "${current}" is not MAJOR.MINOR.PATCH`);
  const [major, minor, patch] = m.slice(1).map(Number);
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      if (SEMVER.test(type)) return type; // explicit x.y.z
      throw new Error(`Unknown bump "${type}" — use patch | minor | major | x.y.z`);
  }
}

// --- requested bump (first meaningful CLI arg) ------------------------------
const arg = process.argv.slice(2).find((a) => a && a !== "--");
if (!arg) fail("Usage: npm run update <patch|minor|major|x.y.z>");

// --- read current version from app.config.js (source of truth) --------------
const cfgRaw = fs.readFileSync(cfgPath, "utf8");
const cfgMatches = cfgRaw.match(new RegExp(CFG_VERSION, "g")) || [];
if (cfgMatches.length !== 1) {
  fail(
    `Expected exactly one \`version: "x.y.z"\` in app.config.js, found ${cfgMatches.length}. ` +
      `Nothing was changed.`
  );
}
const current = CFG_VERSION.exec(cfgRaw)[3];

let next;
try {
  next = nextVersion(current, arg);
} catch (e) {
  fail(e.message);
}

// --- read package.json (for mirroring + a drift note) -----------------------
const pkgRaw = fs.readFileSync(pkgPath, "utf8");
if (!PKG_VERSION.test(pkgRaw)) fail('No "version" field found in package.json.');
const pkgCurrent = JSON.parse(pkgRaw).version;

// --- write both (regex replace preserves formatting / keeps the diff minimal)
fs.writeFileSync(cfgPath, cfgRaw.replace(CFG_VERSION, `$1$2${next}$2`));
fs.writeFileSync(pkgPath, pkgRaw.replace(PKG_VERSION, `$1${next}$2`));

if (pkgCurrent !== current) {
  console.warn(
    `! package.json (${pkgCurrent}) was out of sync with app.config.js (${current}); both set to ${next}.`
  );
}
console.log(`✓ version ${current} → ${next} (app.config.js + package.json)`);
