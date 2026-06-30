import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { Linking, Platform } from "react-native";
import { apiUrl } from "./apiConfig";

const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};

const IGNORED_VERSION_KEY = "appUpdate.ignoredVersionCode";
const DEFAULT_CHANNEL = "direct";

export const isAndroidNative = () => Platform.OS === "android";

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

export const openReleaseTarget = async (release, channel = getDistributionChannel()) => {
  const normalizedChannel = String(channel || DEFAULT_CHANNEL).toLowerCase();

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

  const downloadUrl = release?.downloadPageUrl || release?.browserPlayStoreUrl;
  if (!downloadUrl) {
    throw new Error("No update URL is configured for this release.");
  }
  await Linking.openURL(downloadUrl);
};
