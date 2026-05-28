import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};

const trimTrailingSlash = (value) => String(value || "").trim().replace(/\/+$/, "");

export const BACKEND_BASE_URL = trimTrailingSlash(
  extra.BACKEND_BASE_URL || (extra.IP_ADDR ? `http://${extra.IP_ADDR}:8080` : "")
);

export const isLibreTranslateEnabled = extra.ENABLE_LIBRE_TRANSLATE === true;

export const apiUrl = (path = "") => {
  if (!BACKEND_BASE_URL) {
    throw new Error("BACKEND_BASE_URL is not configured.");
  }

  const normalizedPath = String(path).startsWith("/") ? String(path) : `/${path}`;
  return `${BACKEND_BASE_URL}${normalizedPath}`;
};
