import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { disconnectWebSocket } from "./WebSocketService";
import { getAuthToken } from "./TokenService";
import { apiUrl } from "./apiConfig";

export const registerUser = async (userDetails) => {
  try {
    const response = await axios.post(
      apiUrl(`/auth/register`),
      userDetails
    );
    console.log("User registered successfully:", response.data);
    return response; // This will return the response, likely the registered user data or a success message
  } catch (error) {
    console.error("Error registering user:", error);
    throw error; // You might return false or an error message depending on how you want to handle errors
  }
};

export const loginUser = async (loginDetails) => {
  try {
    const deviceId = await AsyncStorage.getItem("deviceId");
    if (!deviceId) {
      throw new Error("Device ID is not available");
    }

    // Make the API call to the backend login endpoint, passing deviceId as a query parameter
    const response = await axios.post(
      apiUrl(`/auth/login?deviceId=${deviceId}`), // Include deviceId as a query parameter
      loginDetails
    );

    if (response.status === 200) {
      const { accessToken, refreshToken, user } = response.data;

      // Save tokens and user info to AsyncStorage
      await AsyncStorage.setItem("accessToken", accessToken);
      await AsyncStorage.setItem("refreshToken", refreshToken);
      await AsyncStorage.setItem("user", JSON.stringify(user));

      return { success: true, user };  // Return success and user info
    }
  } catch (error) {
    console.error("❌ Error logging in user:", error.response?.data || error);
    return { success: false, error: error.response?.data || "Login failed." };  // Handle error case
  }
};


export const logoutUser = async () => {
  // Read the access token directly: going through getAuthToken() here would
  // try to refresh, and a rejected refresh calls logoutUser again (recursion).
  const authToken = await AsyncStorage.getItem("accessToken");
  const refreshToken = await AsyncStorage.getItem("refreshToken"); // Get the stored refresh token

  if (!refreshToken) {
    // console.error("No refresh token available for logout");
    return;
  }

  // Fetch deviceId from AsyncStorage
  const deviceId = await AsyncStorage.getItem("deviceId");
  if (!deviceId) {
    console.error("No deviceId available for logout");
    return;
  }

  try {
    // Make the logout request with refreshToken in the request body and deviceId as a query parameter
    const response = await axios.post(
      apiUrl(`/auth/logout?deviceId=${deviceId}`), // Your API endpoint
      { refreshToken },  // Request body contains the refreshToken
      {
        headers: { Authorization: `Bearer ${authToken}` },  // Include the authorization header
      }
    );

    console.log("Logout successful:", response.data);

    // Optionally, clear any AsyncStorage and perform other actions
    await AsyncStorage.multiRemove(["accessToken", "refreshToken", "user"]);
    disconnectWebSocket();  // Disconnect WebSocket

  } catch (error) {
    console.error("Error during logout:", error.response?.data || error);
    console.warn("⚠️ Logout API call failed, but clearing storage...");
    // Optionally clear storage here if the API call fails
    await AsyncStorage.multiRemove(["accessToken", "refreshToken", "user"]);
    disconnectWebSocket();  // Disconnect WebSocket
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
