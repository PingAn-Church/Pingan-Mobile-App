import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuthToken } from "./TokenService"; // Ensure this is where your auth token logic is located
import { apiUrl } from "./apiConfig";


// Send the push token to the backend for login
export const registerPushTokenForLogin = async (token, deviceType, deviceId) => {
    const authToken = await getAuthToken();  // Ensure the user is authenticated
    const userId = await getUserId();  // Get the current logged-in user's ID

    try {
      const encodedToken = encodeURIComponent(token); // Encode the token to handle special characters

      const response = await axios.post(
        apiUrl(`/api/push-notifications/login`),  // Endpoint for login
        null,
        {
          params: { token: encodedToken, userId: userId, deviceType, deviceId },
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      console.log("Push Token registered for login:", response.data);
    } catch (error) {
      console.error("Failed to register push token for login:", error);
    }
  };

// Send the push token to the backend for registration (inactive)
export const registerPushTokenForRegister = async (token, userId, deviceType, deviceId) => {
  try {
    const encodedToken = encodeURIComponent(token); // Encode the token to handle special characters

    const response = await axios.post(
      apiUrl(`/api/push-notifications/register`),  // Endpoint for registration
      null,
      {
        params: { token: encodedToken, userId: userId, deviceType, deviceId },
      }
    );
    console.log("Push Token registered for registration:", response.data);
  } catch (error) {
    console.error("Failed to register push token for registration:", error);
  }
};

// Deactivate the push token (set as inactive)
export const deactivatePushToken = async (token) => {
  const authToken = await getAuthToken();  // Ensure the user is authenticated

  // Assuming you have the userId available
  const userId = await getUserId();  // Add logic to fetch the current logged-in user ID

  try {
    const encodedToken = encodeURIComponent(token); // Encode the token to handle special characters

    const response = await axios.post(
      apiUrl(`/api/push-notifications/deactivate`),  // Your backend endpoint
      null,  // No body needed since we are sending params in the URL
      {
        params: { token: encodedToken, userId },  // Send encoded token and userId as query params
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    console.log("Push Token deactivated:", response.data);
  } catch (error) {
    console.error("Failed to deactivate push token:", error);
  }
};

// Unregister the push token (remove from the database)
export const unregisterPushToken = async (token) => {
  const authToken = await getAuthToken();  // Ensure the user is authenticated

  // Assuming you have the userId available
  const userId = await getUserId();  // Add logic to fetch the current logged-in user ID

  try {
    const encodedToken = encodeURIComponent(token); // Encode the token to handle special characters

    const response = await axios.delete(
      apiUrl(`/api/push-notifications/unregister`),  // Your backend endpoint
      {
        params: { token: encodedToken, userId },  // Send encoded token and userId as query params
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    console.log("Push Token unregistered:", response.data);
  } catch (error) {
    console.error("Failed to unregister push token:", error);
  }
};

// Helper function to fetch the userId from the stored user data
const getUserId = async () => {
  const user = await AsyncStorage.getItem("user");
  if (user) {
    return JSON.parse(user).id;
  }
  return null;
};
