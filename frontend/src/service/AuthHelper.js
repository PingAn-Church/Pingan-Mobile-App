import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import Constants from "expo-constants";
import { disconnectWebSocket } from "./WebSocketService"; // ✅ No cycle here

const { IP_ADDR } = Constants.expoConfig?.extra;

// ✅ Logout User - Clears Tokens & Disconnects WebSocket
export const logoutUser = async () => {
  const refreshToken = await AsyncStorage.getItem("refreshToken");

  if (refreshToken) {
    try {
      await axios.post(`http://${IP_ADDR}:8080/auth/logout`, { refreshToken });
    } catch (error) {
      console.warn("⚠️ Logout API call failed, but clearing storage...");
    }
  }

  await AsyncStorage.removeItem("accessToken");
  await AsyncStorage.removeItem("refreshToken");
  await AsyncStorage.removeItem("user");

  disconnectWebSocket(); // ✅ WebSocket dependency is now here
};
