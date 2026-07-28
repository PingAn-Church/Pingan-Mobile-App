#!/usr/bin/env node
/**
 * Builds a release APK or AAB.
 *
 * Wraps Gradle rather than calling it from the npm script directly: npm's script
 * shell is not consistent across setups here (cmd.exe rejects `./gradlew`, POSIX
 * shells reject a bare `gradlew.bat`), so neither spelling works everywhere.
 *
 * Always passes scripts/short-cxx-path.gradle, which moves the C++ build staging
 * directory to a short path — without it release builds fail on Windows with
 * "ninja: error: manifest 'build.ninja' still dirty after 100 tries". See that
 * file for the full explanation.
 *
 * Usage:
 *   npm run build:apk
 *   npm run build:aab
 *   npm run build:apk -- -PcxxBuildRoot=D:/cxx      (extra Gradle args pass through)
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const TASKS = { apk: "assembleRelease", aab: "bundleRelease" };

const target = process.argv[2];
const task = TASKS[target];
if (!task) {
  console.error(`✗ Unknown target "${target}". Expected one of: ${Object.keys(TASKS).join(", ")}`);
  process.exit(1);
}

const frontendRoot = path.resolve(__dirname, "..");
const androidDir = path.join(frontendRoot, "android");
const initScript = path.join(frontendRoot, "scripts", "short-cxx-path.gradle");

if (!fs.existsSync(androidDir)) {
  console.error("✗ No android/ directory. Run `npx expo prebuild --platform android` first.");
  process.exit(1);
}

// Absolute path on purpose: some shells set NoDefaultCurrentDirectoryInExePath,
// which stops cmd resolving `gradlew.bat` from the working directory even though
// that is where it lives.
const isWindows = process.platform === "win32";
const gradlew = path.join(androidDir, isWindows ? "gradlew.bat" : "gradlew");

const args = [
  task,
  "-x", "lint",
  "-x", "test",
  "-I", `"${initScript}"`,
  // Phones only. Emulator ABIs would roughly double the build for an artifact
  // that is going onto a device.
  "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a",
  ...process.argv.slice(3),
];

console.log(`Building ${target.toUpperCase()} (${task})…`);

// shell: true so Windows can launch the .bat — Node refuses to spawn .bat/.cmd
// directly. Paths above are quoted accordingly.
const result = spawnSync(`"${gradlew}"`, args, { cwd: androidDir, stdio: "inherit", shell: true });

if (result.error) {
  console.error(`✗ ${result.error.message}`);
  process.exit(1);
}

if (result.status === 0) {
  const out = target === "apk"
    ? path.join(androidDir, "app/build/outputs/apk/release/app-release.apk")
    : path.join(androidDir, "app/build/outputs/bundle/release/app-release.aab");
  if (fs.existsSync(out)) {
    console.log(`\n✓ ${out}  (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
    console.log("  Signed with the debug keystore — fine for sideloading, not for Play.");
  }
}

process.exit(result.status === null ? 1 : result.status);
