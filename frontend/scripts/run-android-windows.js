#!/usr/bin/env node
/**
 * Run Expo Android from a short Windows path.
 *
 * Windows/Gradle/RN builds can fail when the repo path is too long. This script
 * maps the frontend directory to a short drive with `subst`, runs Expo from that
 * drive, then removes the mapping when the command exits.
 *
 * Usage:
 *   npm run android:windows
 *   npm run android:windows -- --device
 *
 * Optional:
 *   $env:PINGAN_ANDROID_DRIVE = "R:"; npm run android:windows
 */
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const isWindows = process.platform === "win32";
const frontendRoot = path.resolve(__dirname, "..");
const drive = (process.env.PINGAN_ANDROID_DRIVE || "P:").toUpperCase();
const forwardedArgs = process.argv.slice(2);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function runSubst(command) {
  return spawnSync("cmd.exe", ["/d", "/s", "/c", command], {
    encoding: "utf8",
    windowsHide: true,
  });
}

function normalizePath(value) {
  return path.resolve(value).toLowerCase();
}

function getExistingMapping() {
  const result = runSubst("subst");
  if (result.status !== 0) {
    fail((result.stderr || result.stdout || "Unable to list subst mappings.").trim());
  }

  const prefix = `${drive}\\: => `;
  const line = result.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.toUpperCase().startsWith(prefix));

  return line ? line.slice(prefix.length).trim() : null;
}

if (!isWindows) {
  fail("android:windows can only run on Windows. Use `npm run android` on other platforms.");
}

if (!/^[A-Z]:$/.test(drive)) {
  fail(`Invalid PINGAN_ANDROID_DRIVE "${drive}". Use a drive letter like P:.`);
}

const existingMapping = getExistingMapping();
let createdMapping = false;

if (existingMapping) {
  if (normalizePath(existingMapping) !== normalizePath(frontendRoot)) {
    fail(`${drive} is already mapped to "${existingMapping}". Set PINGAN_ANDROID_DRIVE to a free drive.`);
  }
} else {
  const result = runSubst(`subst ${drive} "${frontendRoot}"`);
  if (result.status !== 0) {
    fail((result.stderr || result.stdout || `Unable to map ${drive} to "${frontendRoot}".`).trim());
  }
  createdMapping = true;
}

const shortRoot = `${drive}\\`;
const expoCommand = path.join(shortRoot, "node_modules", ".bin", "expo.cmd");
const command = fs.existsSync(expoCommand) ? expoCommand : "npx.cmd";
const args = fs.existsSync(expoCommand) ? ["run:android", ...forwardedArgs] : ["expo", "run:android", ...forwardedArgs];

function cleanup() {
  if (createdMapping) {
    runSubst(`subst ${drive} /D`);
    createdMapping = false;
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

console.log(`Running Android build from ${shortRoot} (mapped to ${frontendRoot})`);

const child = spawn(command, args, {
  cwd: shortRoot,
  env: {
    ...process.env,
    INIT_CWD: shortRoot,
    PWD: shortRoot,
  },
  stdio: "inherit",
  shell: false,
  windowsHide: false,
});

child.on("error", (error) => {
  cleanup();
  fail(error.message);
});

child.on("exit", (code, signal) => {
  cleanup();
  if (signal) {
    console.error(`Android build stopped by ${signal}.`);
    process.exit(1);
  }
  process.exit(code || 0);
});
