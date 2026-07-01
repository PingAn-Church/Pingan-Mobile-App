#!/usr/bin/env node
/**
 * Bump the app version everywhere this repo stores it.
 *
 * `npm version <type>` only updates package.json, but for an Expo app the real
 * version is `expo.version` in app.config.js (Android versionName / iOS
 * CFBundleShortVersionString). Native builds also need monotonically increasing
 * build numbers: Android versionCode and iOS CFBundleVersion. This keeps the
 * generated native projects, package files, and Expo config in lockstep.
 *
 *   npm run update patch     # 0.1.2 -> 0.1.3
 *   npm run update minor     # 0.1.2 -> 0.2.0
 *   npm run update major     # 0.1.2 -> 1.0.0
 *   npm run update 1.4.0     # set an explicit version
 *   npm run update patch -- --force
 *                            # also make the new Android build the minimum
 *                            # supported version in backend release metadata
 *   npm run update patch --link https://rn-app.pingan.org.sg/android
 *                            # also set the Android direct-download page URL
 *                            # (the "Update Now" target). Omitting --link
 *                            # leaves the existing download link unchanged.
 *
 * (If your npm doesn't forward the arg, use: npm run update -- patch)
 *
 * This only edits local files — it does NOT create a git commit or tag.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");
const cfgPath = path.join(root, "app.config.js");
const androidGradlePath = path.join(root, "android", "app", "build.gradle");
const iosInfoPath = path.join(root, "ios", "frontend", "Info.plist");
const iosProjectPath = path.join(root, "ios", "frontend.xcodeproj", "project.pbxproj");
const backendPropertiesPath = path.resolve(root, "..", "backend", "src", "main", "resources", "application.properties");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
const CFG_VERSION = /(version:\s*)(["'])(\d+\.\d+\.\d+)\2/; // expo.version in app.config.js
const CFG_ANDROID_CODE = /(versionCode:\s*)(\d+)/;
const CFG_EXTRA_ANDROID_CODE = /(ANDROID_VERSION_CODE:\s*)(\d+)/;
const CFG_IOS_BUILD = /(buildNumber:\s*)(["'])(\d+)\2/;
const PKG_VERSION = /("version":\s*")\d+\.\d+\.\d+(")/; // first match = package's own version
const GRADLE_VERSION_CODE = /(versionCode\s+)\d+/;
const GRADLE_VERSION_NAME = /(versionName\s+["'])\d+\.\d+\.\d+(["'])/;
const IOS_SHORT_VERSION = /(<key>CFBundleShortVersionString<\/key>\s*<string>)\d+\.\d+\.\d+(<\/string>)/;
const IOS_BUILD_VERSION = /(<key>CFBundleVersion<\/key>\s*<string>)\d+(<\/string>)/;
const XCODE_CURRENT_PROJECT_VERSION = /(CURRENT_PROJECT_VERSION = )\d+(;)/g;
const XCODE_MARKETING_VERSION = /(MARKETING_VERSION = )\d+\.\d+\.\d+(;)/g;
const BACKEND_ANDROID_LATEST_NAME = /(app\.update\.android\.(?:direct|play)\.latest-version-name=).*/g;
const BACKEND_ANDROID_LATEST_CODE = /(app\.update\.android\.(?:direct|play)\.latest-version-code=)\d+/g;
const BACKEND_ANDROID_MIN_SUPPORTED_CODE = /(app\.update\.android\.(?:direct|play)\.min-supported-version-code=)\d+/g;
const BACKEND_ANDROID_DOWNLOAD_URL = /(app\.update\.android\.direct\.download-page-url=).*/g;

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

function versionCode(version) {
  const m = SEMVER.exec(version);
  if (!m) throw new Error(`Version "${version}" is not MAJOR.MINOR.PATCH`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (minor > 99 || patch > 99) {
    throw new Error("Minor and patch must be <= 99 for MAJOR*10000 + MINOR*100 + PATCH versionCode mapping.");
  }
  return major * 10000 + minor * 100 + patch;
}

function replaceOnce(raw, regex, replacement, label) {
  const matches = raw.match(new RegExp(regex.source, regex.flags.replace("g", ""))) || [];
  if (matches.length === 0) fail(`No ${label} found.`);
  const allMatches = raw.match(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`)) || [];
  if (allMatches.length !== 1) fail(`Expected exactly one ${label}, found ${allMatches.length}.`);
  return raw.replace(regex, replacement);
}

function replaceExpected(raw, regex, replacement, label, expectedCount) {
  const matches = raw.match(regex) || [];
  if (matches.length !== expectedCount) {
    fail(`Expected ${expectedCount} ${label}, found ${matches.length}.`);
  }
  return raw.replace(regex, replacement);
}

// --- parse CLI: <bump> [--force] [--link <url>] -----------------------------
const rawArgs = process.argv.slice(2).filter((a) => a && a !== "--");

let forceMinimumSupported = false;
let downloadLink = null; // null = flag absent (leave existing link untouched)
let arg = null;
const unknownFlags = [];

for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === "--force") {
    forceMinimumSupported = true;
  } else if (a === "--link") {
    downloadLink = rawArgs[++i]; // consume the next token as the URL
  } else if (a.startsWith("--link=")) {
    downloadLink = a.slice("--link=".length);
  } else if (a.startsWith("--")) {
    unknownFlags.push(a);
  } else if (arg === null) {
    arg = a;
  } else {
    unknownFlags.push(a);
  }
}

if (unknownFlags.length) fail(`Unknown or unexpected arg(s): ${unknownFlags.join(", ")}`);
if (!arg) fail("Usage: npm run update <patch|minor|major|x.y.z> [--force] [--link <url>]");
if (downloadLink !== null) {
  downloadLink = (downloadLink || "").trim();
  if (!/^https?:\/\//i.test(downloadLink)) {
    fail("--link requires an http(s) URL, e.g. --link https://rn-app.pingan.org.sg/android");
  }
}

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
const nextCode = versionCode(next);

// --- read package.json (for mirroring + a drift note) -----------------------
const pkgRaw = fs.readFileSync(pkgPath, "utf8");
if (!PKG_VERSION.test(pkgRaw)) fail('No "version" field found in package.json.');
const pkgCurrent = JSON.parse(pkgRaw).version;

// --- write every version holder (regex replace preserves formatting)
let nextCfg = replaceOnce(cfgRaw, CFG_VERSION, `$1$2${next}$2`, "expo.version in app.config.js");
nextCfg = replaceOnce(nextCfg, CFG_ANDROID_CODE, `$1${nextCode}`, "android.versionCode in app.config.js");
nextCfg = replaceOnce(nextCfg, CFG_EXTRA_ANDROID_CODE, `$1${nextCode}`, "extra.ANDROID_VERSION_CODE in app.config.js");
nextCfg = replaceOnce(nextCfg, CFG_IOS_BUILD, `$1$2${nextCode}$2`, "ios.buildNumber in app.config.js");
fs.writeFileSync(cfgPath, nextCfg);

fs.writeFileSync(pkgPath, pkgRaw.replace(PKG_VERSION, `$1${next}$2`));

if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.version = next;
  if (lock.packages?.[""]) lock.packages[""].version = next;
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

if (fs.existsSync(androidGradlePath)) {
  let gradleRaw = fs.readFileSync(androidGradlePath, "utf8");
  gradleRaw = replaceOnce(gradleRaw, GRADLE_VERSION_CODE, `$1${nextCode}`, "Android Gradle versionCode");
  gradleRaw = replaceOnce(gradleRaw, GRADLE_VERSION_NAME, `$1${next}$2`, "Android Gradle versionName");
  fs.writeFileSync(androidGradlePath, gradleRaw);
}

if (fs.existsSync(iosInfoPath)) {
  let infoRaw = fs.readFileSync(iosInfoPath, "utf8");
  infoRaw = replaceOnce(infoRaw, IOS_SHORT_VERSION, `$1${next}$2`, "iOS CFBundleShortVersionString");
  infoRaw = replaceOnce(infoRaw, IOS_BUILD_VERSION, `$1${nextCode}$2`, "iOS CFBundleVersion");
  fs.writeFileSync(iosInfoPath, infoRaw);
}

if (fs.existsSync(iosProjectPath)) {
  let projectRaw = fs.readFileSync(iosProjectPath, "utf8");
  projectRaw = projectRaw.replace(XCODE_CURRENT_PROJECT_VERSION, `$1${nextCode}$2`);
  projectRaw = projectRaw.replace(XCODE_MARKETING_VERSION, `$1${next}$2`);
  fs.writeFileSync(iosProjectPath, projectRaw);
}

if (fs.existsSync(backendPropertiesPath)) {
  let propsRaw = fs.readFileSync(backendPropertiesPath, "utf8");
  propsRaw = replaceExpected(
    propsRaw,
    BACKEND_ANDROID_LATEST_NAME,
    `$1${next}`,
    "Android latest-version-name entries in backend application.properties",
    2
  );
  propsRaw = replaceExpected(
    propsRaw,
    BACKEND_ANDROID_LATEST_CODE,
    `$1${nextCode}`,
    "Android latest-version-code entries in backend application.properties",
    2
  );

  if (forceMinimumSupported) {
    propsRaw = replaceExpected(
      propsRaw,
      BACKEND_ANDROID_MIN_SUPPORTED_CODE,
      `$1${nextCode}`,
      "Android min-supported-version-code entries in backend application.properties",
      2
    );
  }

  if (downloadLink) {
    // Escape `$` so URLs aren't misread as replacement patterns ($1, $&, ...).
    const safeLink = downloadLink.replace(/\$/g, "$$$$");
    propsRaw = replaceExpected(
      propsRaw,
      BACKEND_ANDROID_DOWNLOAD_URL,
      `$1${safeLink}`,
      "Android direct download-page-url in backend application.properties",
      1
    );
  }

  fs.writeFileSync(backendPropertiesPath, propsRaw);
}

if (pkgCurrent !== current) {
  console.warn(
    `! package.json (${pkgCurrent}) was out of sync with app.config.js (${current}); both set to ${next}.`
  );
}
console.log(
  `✓ version ${current} → ${next}, build ${nextCode}` +
    (forceMinimumSupported ? " (minimum supported)" : "") +
    (downloadLink ? `\n  download link → ${downloadLink}` : "")
);
