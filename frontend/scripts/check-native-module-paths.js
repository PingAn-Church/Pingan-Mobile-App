#!/usr/bin/env node
/**
 * Fails fast when expo-modules-core is not hoisted to the top-level node_modules.
 *
 * Windows caps most paths at 260 characters, and the CMake/ninja that ships with
 * Android SDK CMake 3.22.1 (ninja 1.10.2) does not handle longer ones. expo-modules-core
 * has by far the deepest C++ object paths in the tree, so if npm places it at
 * node_modules/expo/node_modules/expo-modules-core instead of node_modules/expo-modules-core,
 * the extra 18 characters push every object file over the limit and
 * `:expo-modules-core:buildCMakeDebug` dies with:
 *
 *   ninja: error: manifest 'build.ninja' still dirty after 100 tries
 *
 * That takes ~20 minutes to surface and says nothing about the real cause, hence this
 * check. npm reproduces whatever layout the lockfile records, so a lockfile written by a
 * sequence of `npm install <pkg>` calls can pin the nested layout indefinitely; only
 * recomputing the tree fixes it.
 *
 * `subst`-ing the repo to a short drive does not help — Gradle resolves the mapping back
 * to the real path before invoking CMake.
 */
const fs = require("fs");
const path = require("path");

const frontendRoot = path.resolve(__dirname, "..");
const hoisted = path.join(frontendRoot, "node_modules", "expo-modules-core");
const nested = path.join(frontendRoot, "node_modules", "expo", "node_modules", "expo-modules-core");

// Only Windows has the path ceiling. Elsewhere the layout is a non-issue.
if (process.platform !== "win32") {
  process.exit(0);
}

// Nothing installed yet - let the build's own error explain that.
if (!fs.existsSync(path.join(frontendRoot, "node_modules"))) {
  process.exit(0);
}

if (fs.existsSync(hoisted) || !fs.existsSync(nested)) {
  process.exit(0);
}

console.error(
  [
    "",
    "✗ expo-modules-core is nested instead of hoisted:",
    `    ${nested}`,
    "",
    "  On Windows this makes the C++ object paths exceed the 260-character limit and the",
    "  Android build fails ~20 minutes in with:",
    "    ninja: error: manifest 'build.ninja' still dirty after 100 tries",
    "",
    "  Fix by recomputing the dependency tree (npm reproduces the lockfile's layout, so",
    "  reinstalling alone is not enough - the lockfile has to be rebuilt too):",
    "",
    "    cd frontend",
    "    rm -rf node_modules package-lock.json",
    "    npm install",
    "",
    "  Then confirm node_modules/expo-modules-core exists and commit the lockfile.",
    "",
  ].join("\n")
);

process.exit(1);
