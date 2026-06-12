import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { logoutUser } from "./AuthService";
import { apiUrl } from "./apiConfig";

// Single-flight refresh: the backend rotates the refresh token on every use,
// so two concurrent refresh calls invalidate each other and force a logout.
// All callers that hit an expired access token await the same promise.
let refreshPromise = null;

const decodeJWT = (token) => {
  if (!token) return null;

  // JWT token is typically in the format "header.payload.signature"
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }

  const base64Url = parts[1]; // Payload is the second part (index 1)
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/"); // Convert URL-safe base64 to standard base64

  // Decode the base64 string
  const decodedPayload = JSON.parse(atob(base64)); // `atob` decodes a base64 encoded string
  return decodedPayload;
};

const isTokenExpired = (token) => {
  if (!token) return true;

  try {
    const decoded = decodeJWT(token);
    return decoded.exp * 1000 < Date.now(); // Check if the token's expiration is less than current time
  } catch (error) {
    console.error("Error decoding token:", error);
    return true;
  }
};

export const getAuthToken = async () => {
  const accessToken = await AsyncStorage.getItem("accessToken");

  if (accessToken && !isTokenExpired(accessToken)) {
    return accessToken;
  }

  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }

  try {
    const newTokens = await refreshPromise;
    return newTokens.accessToken;
  } catch (error) {
    // Only log out when the backend explicitly rejected the refresh token (or
    // there is nothing to refresh with). A network blip must not end the session.
    const status = error?.response?.status;
    if (status === 401 || status === 403 || error?.message === "Missing refresh token or device ID") {
      console.error("❌ Refresh token invalid or expired. Logging out user...");
      await logoutUser();
    } else {
      console.warn("⚠️ Token refresh failed (transient):", error?.message || error);
    }
    return null;
  }
};

export const refreshAccessToken = async () => {
  const refreshToken = await AsyncStorage.getItem("refreshToken");
  const deviceId = await AsyncStorage.getItem("deviceId");

  if (!refreshToken || !deviceId) {
    if (!refreshToken && !deviceId) {
      console.warn("⚠️ Missing both refreshToken and deviceId during refresh.");
    } else if (!refreshToken) {
      console.warn("⚠️ Missing refreshToken during refresh.");
    } else if (!deviceId) {
      console.warn("⚠️ Missing deviceId during refresh.");
    }
    throw new Error("Missing refresh token or device ID");
  }

  try {
    const response = await axios.post(
      apiUrl(`/auth/refresh-token?deviceId=${deviceId}`),
      { refreshToken }
    );

    const { accessToken, refreshToken: newRefreshToken } = response.data;

    await AsyncStorage.setItem("accessToken", accessToken);
    await AsyncStorage.setItem("refreshToken", newRefreshToken);

    console.log("🔄 Successfully refreshed access token.");
    return { accessToken, refreshToken: newRefreshToken };
  } catch (error) {
    console.error("❌ Failed to refresh access token:", error.response?.data || error);
    throw error;
  }
};
