import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

/**
 * On-device LRU cache for chat media (images + voice), with a user-configurable
 * size budget — like Telegram's "Storage Usage". Media is downloaded once from
 * OSS into the app's Caches directory and served locally on subsequent views,
 * cutting repeated presigned-URL downloads and enabling offline replay.
 *
 * Design:
 *  - One unified cache (images + voice share the budget).
 *  - LRU eviction down to the budget on every add and on startup.
 *  - A small JSON manifest (key -> {name, size, lastUsedAt}) persisted in
 *    AsyncStorage gives O(1) usage totals and survives restarts; the files on
 *    disk are reconciled against it on init (defensive against crashes).
 *  - Native-only: on web getLocalUri/peek return null so callers fall back to
 *    the remote URL (the browser caches there).
 */

const DIR_NAME = "chat-media-cache";
const BUDGET_KEY = "mediaCache.budgetBytes";
const MANIFEST_KEY = "mediaCache.manifest";

const MB = 1024 * 1024;
const GB = 1024 * MB;
export const MIN_BUDGET_BYTES = 512 * MB; // 512 MB
export const MAX_BUDGET_BYTES = 8 * GB; // 8 GB
export const DEFAULT_BUDGET_BYTES = 1 * GB; // 1 GB

const isNative = Platform.OS !== "web";

let dir = null;
let budgetBytes = DEFAULT_BUDGET_BYTES;
let manifest = {}; // key -> { name, size, lastUsedAt }
let usageBytes = 0;
let initPromise = null;
const inFlight = new Map(); // key -> Promise<string|null>
let persistTimer = null;

// --- helpers ---------------------------------------------------------------

function clampBudget(n) {
  if (!Number.isFinite(n)) return DEFAULT_BUDGET_BYTES;
  return Math.min(MAX_BUDGET_BYTES, Math.max(MIN_BUDGET_BYTES, Math.round(n)));
}

// Stable filename from the object key (string hash + original extension), so the
// signed query string on a presigned URL never changes the cache identity.
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
function normalizeKey(content) {
  return String(content || "").split("?")[0].trim();
}
function extFor(key) {
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(key);
  return m ? m[1].toLowerCase() : "bin";
}
function fileNameFor(key) {
  return `${djb2(key)}.${extFor(key)}`;
}
function nameOf(file) {
  return String(file?.uri || "").split("/").pop();
}
function isCacheableRemoteUrl(url) {
  const value = String(url || "").trim();
  if (!/^https?:\/\//i.test(value)) return false;
  return !/\/\/via\.placeholder\.com\//i.test(value);
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistManifest();
  }, 4000);
}
async function persistManifest() {
  try {
    await AsyncStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
  } catch {
    // best-effort
  }
}

// Rebuild in-memory state from what's actually on disk (files are the source of
// truth for sizes). Manifest entries without a file are dropped; files without a
// manifest entry are unusable (no key mapping) and removed to reclaim space.
function reconcile() {
  let files = [];
  try {
    files = dir.list().filter((e) => e instanceof File);
  } catch {
    files = [];
  }
  const nameToKey = {};
  for (const [k, v] of Object.entries(manifest)) nameToKey[v.name] = k;

  const next = {};
  let total = 0;
  for (const f of files) {
    const name = nameOf(f);
    const key = nameToKey[name];
    let size = 0;
    try {
      size = f.size || 0;
    } catch {
      size = 0;
    }
    if (key) {
      next[key] = { name, size, lastUsedAt: manifest[key]?.lastUsedAt || Date.now() };
      total += size;
    } else {
      try {
        f.delete();
      } catch {
        // ignore
      }
    }
  }
  manifest = next;
  usageBytes = total;
}

function evictToBudget(excludeKey) {
  if (usageBytes <= budgetBytes) return;
  const entries = Object.entries(manifest)
    .filter(([k]) => k !== excludeKey)
    .sort((a, b) => (a[1].lastUsedAt || 0) - (b[1].lastUsedAt || 0)); // least-recently-used first
  for (const [key, meta] of entries) {
    if (usageBytes <= budgetBytes) break;
    try {
      new File(dir, meta.name).delete();
    } catch {
      // ignore
    }
    usageBytes -= meta.size || 0;
    delete manifest[key];
  }
  if (usageBytes < 0) usageBytes = 0;
}

// --- public API ------------------------------------------------------------

export function init() {
  if (!isNative) return Promise.resolve();
  if (initPromise) return initPromise;
  initPromise = (async () => {
    dir = new Directory(Paths.cache, DIR_NAME);
    try {
      dir.create({ idempotent: true, intermediates: true });
    } catch {
      // already exists
    }
    try {
      const v = await AsyncStorage.getItem(BUDGET_KEY);
      if (v != null) budgetBytes = clampBudget(parseInt(v, 10));
    } catch {
      // keep default
    }
    try {
      const raw = await AsyncStorage.getItem(MANIFEST_KEY);
      manifest = raw ? JSON.parse(raw) : {};
    } catch {
      manifest = {};
    }
    reconcile();
    evictToBudget(null);
    await persistManifest();
  })();
  return initPromise;
}

/** Synchronous best-effort lookup for instant render (null if not cached / not yet inited). */
export function peekLocalUri(content) {
  if (!isNative || !dir) return null;
  const key = normalizeKey(content);
  const meta = manifest[key];
  if (!meta) return null;
  try {
    const f = new File(dir, meta.name);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}

/**
 * Return a local file:// URI for the media, downloading from OSS on a miss.
 * @param content      the stored object URL/key (cache identity)
 * @param resolveRemoteUrl  async (content) => presigned download URL (called only on a miss)
 * @returns local URI, or null if uncacheable/failed (caller should fall back to remote)
 */
export async function getLocalUri(content, resolveRemoteUrl) {
  if (!isNative) return null;
  await init();
  const key = normalizeKey(content);
  if (!key) return null;

  const existing = manifest[key];
  if (existing) {
    const f = new File(dir, existing.name);
    if (f.exists) {
      existing.lastUsedAt = Date.now();
      schedulePersist();
      return f.uri;
    }
    usageBytes -= existing.size || 0;
    delete manifest[key];
  }

  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    try {
      const url = await resolveRemoteUrl(content);
      if (!isCacheableRemoteUrl(url)) return null;
      const name = fileNameFor(key);
      const target = new File(dir, name);
      try {
        if (target.exists) target.delete();
      } catch {
        // ignore
      }
      const downloaded = await File.downloadFileAsync(url, target, { idempotent: true });
      let size = 0;
      try {
        size = downloaded.size || 0;
      } catch {
        size = 0;
      }
      manifest[key] = { name, size, lastUsedAt: Date.now() };
      usageBytes += size;
      evictToBudget(key);
      schedulePersist();
      return downloaded.uri;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

export async function getUsageBytes() {
  await init();
  return usageBytes;
}

export async function getBudgetBytes() {
  await init();
  return budgetBytes;
}

export async function setBudgetBytes(bytes) {
  await init();
  budgetBytes = clampBudget(bytes);
  try {
    await AsyncStorage.setItem(BUDGET_KEY, String(budgetBytes));
  } catch {
    // best-effort
  }
  evictToBudget(null);
  await persistManifest();
  return budgetBytes;
}

export async function clearAll() {
  if (!isNative) return;
  await init();
  for (const meta of Object.values(manifest)) {
    try {
      new File(dir, meta.name).delete();
    } catch {
      // ignore
    }
  }
  // sweep any stray files too
  try {
    dir.list().forEach((e) => {
      try {
        e.delete();
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
  manifest = {};
  usageBytes = 0;
  await persistManifest();
}
