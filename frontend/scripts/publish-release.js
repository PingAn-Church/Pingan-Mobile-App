#!/usr/bin/env node
/**
 * Mark a built release as actually installable ("live") on a distribution
 * channel, which is what makes the in-app update prompt appear.
 *
 * `npm run update` bumps the version and deploys new metadata with the next
 * CI/CD run — but a store build is not downloadable until review passes, days
 * later. So the backend keeps two version numbers per channel:
 *
 *   latest-*      the release that has been built and submitted  (npm run update)
 *   published-*   the release the channel can install right now  (this script)
 *
 * Clients are only ever told about published-*, so nobody is prompted toward a
 * build the store has not got yet, and a force-update cannot lock anyone out
 * while review is pending.
 *
 *   npm run live status        # what is built vs what is live, per channel
 *   npm run live direct        # the APK is uploaded — announce it
 *   npm run live play          # Play review passed — announce it
 *   npm run live all           # both channels at once
 *   npm run live play 1.0.0    # pin a channel to an earlier release (rollback)
 *
 * The two channels go live at different times, which is the whole point of
 * doing them separately: `direct` is live as soon as the APK is on the mirror,
 * `play` only once Google finishes review.
 *
 * Releases are sparse — several bumps can happen between two of them (1.0.0
 * ships, 1.0.1 and 1.0.2 are built but never go out, 1.0.3 ships). That needs no
 * special handling: publishing always means "whatever is built now", so a build
 * that never shipped simply never becomes the published one.
 *
 * This only edits backend/src/main/resources/application.properties — it does
 * NOT create a git commit, and the backend must be redeployed to take effect.
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

const CHANNELS = ["direct", "play"];
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// Same MAJOR*10000 + MINOR*100 + PATCH mapping update-version.js uses, so a
// version named here lands on the code the build actually carries.
function versionCode(version) {
  const m = SEMVER.exec(version);
  if (!m) fail(`Version "${version}" is not MAJOR.MINOR.PATCH`);
  const [major, minor, patch] = m.slice(1).map(Number);
  if (minor > 99 || patch > 99) {
    fail("Minor and patch must be <= 99 for the MAJOR*10000 + MINOR*100 + PATCH versionCode mapping.");
  }
  return major * 10000 + minor * 100 + patch;
}

const propKey = (channel, name) => `app.update.android.${channel}.${name}`;

function readProp(raw, channel, name) {
  const m = new RegExp(`^${propKey(channel, name).replace(/\./g, "\\.")}=(.*)$`, "m").exec(raw);
  return m ? m[1].trim() : null;
}

function writeProp(raw, channel, name, value) {
  const key = propKey(channel, name);
  const regex = new RegExp(`^(${key.replace(/\./g, "\\.")}=).*$`, "m");
  if (!regex.test(raw)) fail(`No ${key} found in application.properties.`);
  return raw.replace(regex, `$1${value}`);
}

const CHANNEL_FIELDS = {
  latestName: "latest-version-name",
  latestCode: "latest-version-code",
  publishedName: "published-version-name",
  publishedCode: "published-version-code",
};

function readChannel(raw, channel) {
  const state = {};
  for (const [field, prop] of Object.entries(CHANNEL_FIELDS)) {
    const value = readProp(raw, channel, prop);
    if (value === null) {
      fail(
        `Missing ${propKey(channel, prop)} in application.properties. ` +
          `Is the backend up to date with the publication gate?`
      );
    }
    state[field] = value;
  }
  return {
    latestName: state.latestName,
    latestCode: Number(state.latestCode),
    publishedName: state.publishedName,
    publishedCode: Number(state.publishedCode),
  };
}

function printStatus(raw) {
  console.log("channel  built (latest)   live (published)   state");
  for (const channel of CHANNELS) {
    const c = readChannel(raw, channel);
    const built = `${c.latestName} (${c.latestCode})`;
    const live = c.publishedCode > 0 ? `${c.publishedName} (${c.publishedCode})` : "nothing";
    const state =
      c.publishedCode >= c.latestCode
        ? "live — users are prompted"
        : `holding back — run \`npm run live ${channel}\` once it is downloadable`;
    console.log(`${channel.padEnd(8)} ${built.padEnd(16)} ${live.padEnd(18)} ${state}`);
  }
}

// --- parse CLI: <status|direct|play|all> [x.y.z] -----------------------------
// Bare words, so nothing has to survive npm's flag stripping.
const rawArgs = process.argv.slice(2).filter((a) => a && a !== "--");

const USAGE =
  "Usage: npm run live <status|direct|play|all> [x.y.z]\n" +
  "  npm run live status     # what is built vs what is live\n" +
  "  npm run live play       # Play review passed — announce the built version\n" +
  "  npm run live all        # announce on both channels\n" +
  "  npm run live play 1.0.0 # pin one channel to an earlier release";

let target = null;
let explicitVersion = null;
const unexpected = [];

for (const a of rawArgs) {
  if (a === "status" || a === "all" || CHANNELS.includes(a)) {
    if (target !== null) fail(`More than one channel given: ${target}, ${a}`);
    target = a;
  } else if (SEMVER.test(a)) {
    if (explicitVersion !== null) fail(`More than one version given: ${explicitVersion}, ${a}`);
    explicitVersion = a;
  } else {
    unexpected.push(a);
  }
}

if (unexpected.length) fail(`Unknown arg(s): ${unexpected.join(", ")}\n${USAGE}`);
if (target === null) fail(USAGE);
if (explicitVersion !== null && target === "status") {
  fail("`status` only reports — drop the version, or name a channel to publish it.");
}
if (explicitVersion !== null && target === "all") {
  fail("A specific version has to name its channel: `npm run live play 1.0.0`.");
}

if (!fs.existsSync(backendPropertiesPath)) {
  fail(`Backend properties not found at ${backendPropertiesPath}`);
}

let props = fs.readFileSync(backendPropertiesPath, "utf8");

if (target === "status") {
  printStatus(props);
  process.exit(0);
}

const targets = target === "all" ? CHANNELS : [target];
const published = [];

for (const channel of targets) {
  const c = readChannel(props, channel);
  const name = explicitVersion ?? c.latestName;
  const code = explicitVersion ? versionCode(explicitVersion) : c.latestCode;

  // Announcing something that was never built means pointing users at a download
  // that does not exist — the exact failure this gate is here to prevent.
  if (code > c.latestCode) {
    fail(
      `${channel}: ${name} (${code}) is newer than the built version ${c.latestName} (${c.latestCode}). ` +
        `Run \`npm run update\` first.`
    );
  }

  if (code === c.publishedCode) {
    console.log(`· ${channel} is already live on ${name} (${code}) — nothing to do.`);
    continue;
  }

  // Version numbers are sparse: builds get skipped between releases, so an
  // earlier version is not evidence that it ever shipped. Only the current
  // built and live versions are known to be real, and there is no history to
  // check the rest against — so say so rather than pretend to validate it.
  if (explicitVersion !== null && code !== c.latestCode && code !== c.publishedCode) {
    console.warn(
      `! ${channel}: ${name} (${code}) is neither the built version ${c.latestName} (${c.latestCode}) ` +
        `nor the live one ${c.publishedName} (${c.publishedCode}).\n` +
        `  Publish it only if that build really is downloadable — skipped builds never were.`
    );
  }

  props = writeProp(props, channel, "published-version-name", name);
  props = writeProp(props, channel, "published-version-code", String(code));
  published.push({ channel, name, code, previous: c.publishedCode });
}

if (!published.length) process.exit(0);

fs.writeFileSync(backendPropertiesPath, props);

for (const p of published) {
  const direction = p.code < p.previous ? "rolled back to" : "→";
  console.log(`✓ ${p.channel} live ${direction} ${p.name} (${p.code})`);
}
console.log("Redeploy the backend for the update prompt to start showing.");
