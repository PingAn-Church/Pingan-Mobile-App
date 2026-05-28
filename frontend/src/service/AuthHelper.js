import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { disconnectWebSocket } from "./WebSocketService"; // ✅ No cycle here
import { apiUrl } from "./apiConfig";

export const logoutUser = async () => {
  const refreshToken = await AsyncStorage.getItem("refreshToken");

  if (refreshToken) {
    try {
      await axios.post(apiUrl(`/auth/logout`), { refreshToken });
    } catch (error) {
      console.warn("⚠️ Logout API call failed, but clearing storage...");
    }
  }

  await AsyncStorage.removeItem("accessToken");
  await AsyncStorage.removeItem("refreshToken");
  await AsyncStorage.removeItem("user");

  disconnectWebSocket(); // ✅ WebSocket dependency is now here
};
