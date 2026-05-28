import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { logoutUser } from "./AuthService";
import { apiUrl } from "./apiConfig";

let hasAttemptedRefresh = false;

// if (!globalThis.hasTriedRefresh) globalThis.hasTriedRefresh = false;

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
  let accessToken = await AsyncStorage.getItem("accessToken");

  if (accessToken && !isTokenExpired(accessToken)) {
    return accessToken;
  }

  if (hasAttemptedRefresh) {
    console.warn("⛔ Already tried refresh in this session. Skipping...");
    return null;
  }

  console.log("⚠️ Access Token expired or missing, attempting refresh...");
  hasAttemptedRefresh = true;

  try {
    const newTokens = await refreshAccessToken(); // Tries refreshing
    hasAttemptedRefresh = false; // Reset if successful
    return newTokens.accessToken;
  } catch (error) {
    console.error("❌ Refresh token invalid or expired. Logging out user...");
    await logoutUser();
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
