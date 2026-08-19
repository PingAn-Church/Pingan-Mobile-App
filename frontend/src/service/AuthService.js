import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { disconnectWebSocket } from "./WebSocketService";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";
import { clearAll as clearMediaCache } from "./MediaCacheService";

const clearLocalSession = async () => {
  try {
    await clearMediaCache();
  } catch (error) {
    console.warn("Failed to clear media cache during logout:", error);
  }

  try {
    await AsyncStorage.multiRemove(["accessToken", "refreshToken", "user"]);
  } catch (error) {
    console.warn("Failed to clear auth storage during logout:", error);
  }

  disconnectWebSocket();
};

export const registerUser = async (userDetails) => {
  try {
    // Stashes the sign-up server-side (no account row yet); the row is created and
    // tokens are issued only once verifyCode confirms the emailed code.
    const response = await axios.post(apiUrl(`/auth/register`), userDetails);
    return response;
  } catch (error) {
    console.error("Error registering user:", error);
    throw error; // You might return false or an error message depending on how you want to handle errors
  }
};

// Request an email verification code (60s cooldown + daily cap enforced server-side).
// Throws on rate-limit so the caller can surface the message.
export const sendVerificationCode = async (email) => {
  return axios.post(apiUrl(`/auth/send-verification-code`), { email });
};

// Verify the emailed code. On success the account is verified and tokens are
// stored, logging the user in automatically (mirrors loginUser).
export const verifyCode = async (email, code) => {
  try {
    const deviceId = await AsyncStorage.getItem("deviceId");
    if (!deviceId) {
      throw new Error("Device ID is not available");
    }
    const response = await axios.post(
      apiUrl(`/auth/verify-code`),
      { email, code },
      { params: { deviceId } }
    );
    if (response.status === 200) {
      const { accessToken, refreshToken, user } = response.data;
      await AsyncStorage.multiSet([
        ["accessToken", accessToken],
        ["refreshToken", refreshToken],
        ["user", JSON.stringify(user)],
      ]);
      return { success: true, user };
    }
    return { success: false };
  } catch (error) {
    return { success: false, error: error.response?.data || "Verification failed." };
  }
};

export const loginUser = async (loginDetails) => {
  try {
    const deviceId = await AsyncStorage.getItem("deviceId");
    if (!deviceId) {
      throw new Error("Device ID is not available");
    }

    // Make the API call to the backend login endpoint, passing deviceId as a
    // properly-encoded query parameter.
    const response = await axios.post(
      apiUrl(`/auth/login`),
      loginDetails,
      { params: { deviceId } }
    );

    if (response.status === 200) {
      const { accessToken, refreshToken, user } = response.data;

      // Save tokens and user info in one atomic write.
      await AsyncStorage.multiSet([
        ["accessToken", accessToken],
        ["refreshToken", refreshToken],
        ["user", JSON.stringify(user)],
      ]);

      return { success: true, user };  // Return success and user info
    }
  } catch (error) {
    console.error("❌ Error logging in user:", error.response?.data || error);
    // Expose the HTTP status so the screen can tell apart wrong credentials /
    // deactivated account (401) from a network failure (no response at all).
    return {
      success: false,
      status: error.response?.status ?? null,
      error: error.response?.data || "Login failed.",
    };
  }
};


export const logoutUser = async () => {
  const refreshToken = await AsyncStorage.getItem("refreshToken"); // Get the stored refresh token

  if (!refreshToken) {
    await clearLocalSession();
    return;
  }

  // Fetch deviceId from AsyncStorage
  const deviceId = await AsyncStorage.getItem("deviceId");
  if (!deviceId) {
    console.error("No deviceId available for logout");
    await clearLocalSession();
    return;
  }

  try {
    // Make the logout request with refreshToken in the request body and deviceId as a query parameter
    const response = await axios.post(
      apiUrl(`/auth/logout`),
      { refreshToken },  // Request body contains the refreshToken
      {
        params: { deviceId },  // properly-encoded query parameter
      }
    );

    console.log("Logout successful:", response.data);

  } catch (error) {
    console.error("Error during logout:", error.response?.data || error);
    console.warn("⚠️ Logout API call failed, but clearing storage...");
  } finally {
    await clearLocalSession();
  }
};

export const requestPasswordReset = async (email) => {
  try {
    await axios.post(apiUrl(`/auth/reset-password`), { email });
  } catch (error) {
    console.error("Error resetting password:", error);
    throw error;
  }
};

export const changePassword = async (currentPassword, newPassword) => {
  const token = await getAuthToken();
  const response = await axios.post(
    apiUrl(`/auth/change-password`),
    { currentPassword, newPassword },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};
