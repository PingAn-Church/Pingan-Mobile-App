import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as Localization from "expo-localization";
import { Linking, Platform } from "react-native";
import { apiUrl } from "./apiConfig";

const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};

const IGNORED_VERSION_KEY = "appUpdate.ignoredVersionCode";
const DEFAULT_CHANNEL = "direct";

// The App Store listing (https://apps.apple.com/app/id6774477173). iOS update
// checks ask Apple's public lookup API about this id, so the prompt can only
// ever appear once the App Store is actually serving the new version — the
// same "never point at a store that hasn't got it" guarantee the Android side
// gets from the backend's published-* gate, with no publish step to run.
export const APPLE_APP_ID = "6774477173";
const ITUNES_LOOKUP_URL = "https://itunes.apple.com/lookup";

export const isAndroidNative = () => Platform.OS === "android";
export const isIosNative = () => Platform.OS === "ios";
export const isSupportedUpdatePlatform = () => isAndroidNative() || isIosNative();

// The Android versionCode scheme (major*10000 + minor*100 + patch), derived
// from a version name. Used on iOS, where the store lookup only exposes the
// marketing version string — deriving codes on BOTH sides of the comparison
// keeps it apples-to-apples.
export const versionNameToCode = (name) => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(name || "").trim());
  if (!match) return 0;
  return Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
};

export const getDistributionChannel = () =>
  String(extra.DISTRIBUTION_CHANNEL || DEFAULT_CHANNEL).trim().toLowerCase();

export const getCurrentAndroidVersion = () => {
  const nativeVersionCode = Number.parseInt(Application.nativeBuildVersion, 10);
  const configVersionCode = Number.parseInt(extra.ANDROID_VERSION_CODE, 10);

  return {
    versionName:
      Application.nativeApplicationVersion ||
      Constants.expoConfig?.version ||
      Constants.manifest?.version ||
      "0.0.0",
    versionCode: Number.isFinite(nativeVersionCode)
      ? nativeVersionCode
      : Number.isFinite(configVersionCode)
        ? configVersionCode
        : 0,
  };
};

export const fetchLatestAndroidRelease = async (channel = getDistributionChannel()) => {
  const response = await axios.get(apiUrl("/api/app-releases/latest"), {
    params: { platform: "android", channel },
  });
  return response.data?.data || response.data;
};

export const getCurrentIosVersion = () => {
  const versionName =
    Application.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    Constants.manifest?.version ||
    "0.0.0";
  return { versionName, versionCode: versionNameToCode(versionName) };
};

/**
 * Asks Apple what version the App Store is serving, shaped like the backend's
 * Android release payload so the rest of the update flow needs no branching.
 *
 * Storefronts can lag each other during a phased release, so the device's
 * likely storefront is asked first (CN for China devices, SG otherwise), then
 * the others as fallback. Force-update stays Android-only: the store exposes no
 * min-supported signal, so an iOS prompt is always dismissable.
 */
export const fetchLatestIosRelease = async () => {
  const storefronts = isLikelyChinaRegion() ? ["cn", "sg", ""] : ["sg", "cn", ""];
  let lastError = null;
  for (const country of storefronts) {
    try {
      const response = await axios.get(ITUNES_LOOKUP_URL, {
        params: { id: APPLE_APP_ID, ...(country ? { country } : {}) },
      });
      // The lookup answers with a text/javascript content type; axios usually
      // still parses the JSON body, but don't depend on it.
      const data =
        typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      const result = data?.results?.[0];
      if (result?.version) {
        const notes = result.releaseNotes || "";
        return {
          latestVersionName: result.version,
          latestVersionCode: versionNameToCode(result.version),
          minSupportedVersionCode: 0,
          forceUpdate: false,
          appStoreUrl: result.trackViewUrl || `https://apps.apple.com/app/id${APPLE_APP_ID}`,
          // Store notes are single-language (whatever the release uploaded);
          // serve them for both app languages rather than hiding one.
          releaseNotes: { en: notes, zh: notes },
        };
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("App Store lookup returned no result.");
};

export const evaluateAndroidRelease = (current, release) => {
  const currentCode = Number(current?.versionCode || 0);
  const latestCode = Number(release?.latestVersionCode || 0);
  const minSupportedCode = Number(release?.minSupportedVersionCode || 0);
  const updateAvailable = latestCode > currentCode;
  const forceUpdate = updateAvailable && (Boolean(release?.forceUpdate) || currentCode < minSupportedCode);

  return {
    updateAvailable,
    forceUpdate,
    status: forceUpdate ? "unsupported" : updateAvailable ? "available" : "latest",
  };
};

export const getIgnoredVersionCode = async () => {
  const raw = await AsyncStorage.getItem(IGNORED_VERSION_KEY);
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
};

export const ignoreReleaseVersion = async (versionCode) => {
  if (!versionCode) return;
  await AsyncStorage.setItem(IGNORED_VERSION_KEY, String(versionCode));
};

export const clearIgnoredReleaseVersion = async () => {
  await AsyncStorage.removeItem(IGNORED_VERSION_KEY);
};

// China blocks Google Play/Drive, so China-based devices get a China-reachable
// mirror while everyone else gets the international (Google) link. We decide on
// the device from region + timezone — the only geo signal available on-device
// without an external IP lookup (which is itself unreliable/blocked in China).
const CHINA_TIMEZONES = new Set([
  "Asia/Shanghai",
  "Asia/Urumqi",
  "Asia/Chongqing",
  "Asia/Harbin",
  "Asia/Kashgar",
  "Asia/Kashi",
]);

export const isLikelyChinaRegion = () => {
  try {
    const locales = Localization.getLocales?.() || [];
    if (locales.some((l) => String(l.regionCode || "").toUpperCase() === "CN")) {
      return true;
    }
    const calendars = Localization.getCalendars?.() || [];
    if (calendars.some((c) => CHINA_TIMEZONES.has(c.timeZone))) return true;
  } catch (e) {
    // fall through to the international default
  }
  return false;
};

// The direct-distribution download for this device: the China mirror for
// China-based devices, the international (Google) link otherwise, each with a
// fallback to the other, then the browser Play URL. Also returns the China
// mirror's share password when that mirror is what we'll open — some CN clouds
// (e.g. Lanzou) gate the share behind a password the user has to type in.
export const resolveDirectDownload = (release) => {
  const cnUrl = release?.downloadPageUrlCn || null;
  const intlUrl = release?.downloadPageUrl || null;
  const inChina = isLikelyChinaRegion();
  const url =
    (inChina ? cnUrl || intlUrl : intlUrl || cnUrl) ||
    release?.browserPlayStoreUrl ||
    null;
  const password = url && url === cnUrl ? release?.downloadPasswordCn || null : null;
  return { url, password };
};

export const openReleaseTarget = async (release, channel = getDistributionChannel()) => {
  const normalizedChannel = String(channel || DEFAULT_CHANNEL).toLowerCase();

  if (normalizedChannel === "appstore") {
    const storeUrl = release?.appStoreUrl || `https://apps.apple.com/app/id${APPLE_APP_ID}`;
    await Linking.openURL(storeUrl);
    return;
  }

  if (normalizedChannel === "play") {
    const playUrl = release?.playStoreUrl;
    if (playUrl && (await Linking.canOpenURL(playUrl))) {
      await Linking.openURL(playUrl);
      return;
    }

    const browserPlayUrl = release?.browserPlayStoreUrl;
    if (browserPlayUrl) {
      await Linking.openURL(browserPlayUrl);
      return;
    }
  }

  const { url: downloadUrl } = resolveDirectDownload(release);
  if (!downloadUrl) {
    throw new Error("No update URL is configured for this release.");
  }
  await Linking.openURL(downloadUrl);
};
