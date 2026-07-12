import React, { createContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { refreshAccessToken, getAuthToken } from "../service/TokenService";
import { fetchUserProfile, getOnlineUsers } from "../service/UserService";
import { logoutUser as logoutService } from "../service/AuthService";
// import { v4 as uuidv4 } from "uuid"; // Import uuid for generating unique IDs
import uuid from 'react-native-uuid';

export const UserContext = createContext();
const GUEST_MODE_KEY = "guestMode";

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userReady, setUserReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userStatus, setUserStatus] = useState({});
  const [deviceId, setDeviceId] = useState(null);  
  const [isGuest, setIsGuest] = useState(false);

  // Fetch the device ID or generate one if not found
  const getDeviceId = async () => {
    let deviceId = await AsyncStorage.getItem("deviceId");
    if (!deviceId) {
      deviceId = uuid.v4(); // Generate a new deviceId if not found
      await AsyncStorage.setItem("deviceId", deviceId);
    }
    setDeviceId(deviceId); // Save it to state for global access
  };

  const fetchUserData = async () => {
    if (userReady && user) return user;
  
    try {
      let token = await getAuthToken();
      if (!token) return null;
  
      const userInfo = await fetchUserProfile();
      setUser(userInfo);
      setUserReady(true);
      setIsGuest(false);
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      return userInfo;
    } catch (error) {
      console.error("❌ Error fetching user info:", error);
      setUser(null);
      setUserReady(false);
      return null;
    }
  };
  

  const fetchOnlineUsers = async () => {
    if (!user?.id) return;
    try {
      const onlineMap = await getOnlineUsers(); // id-keyed map from the backend
      setUserStatus({ ...onlineMap, [String(user.id)]: "online" }); // Mark self online
    } catch (err) {
      console.error("❌ Failed to fetch online users:", err);
    }
  };

  const logout = async () => {
    await logoutService(); // Clears accessToken/refreshToken/user + disconnects WebSocket
    await AsyncStorage.removeItem(GUEST_MODE_KEY);
    setUser(null);
    setUserReady(false);
    setIsGuest(false);
    setUserStatus({});
  };

  const enterGuestMode = async () => {
    // Remove only identity credentials. Guest mode keeps language, device id,
    // storage preferences and downloaded media intact.
    await AsyncStorage.multiRemove(["accessToken", "refreshToken", "user"]);
    await AsyncStorage.setItem(GUEST_MODE_KEY, "true");
    setUser(null);
    setUserReady(false);
    setUserStatus({});
    setIsGuest(true);
    setLoading(false);
  };

  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      if (hasInitialized) return; // ⛔ Prevent rerun
      setHasInitialized(true);

      try {
        await getDeviceId();
        const restoredUser = await fetchUserData();
        if (!restoredUser) {
          setIsGuest((await AsyncStorage.getItem(GUEST_MODE_KEY)) === "true");
        }
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [hasInitialized]); // ✅ Only run once per mount


  // ✅ Once user is set, fetch online user status
  useEffect(() => {
    if (user) {
      fetchOnlineUsers();
    }
  }, [user]);

  return (
    <UserContext.Provider
      value={{
        user,
        isGuest,
        userReady,
        loading,
        setUser,
        setUserReady,
        fetchUserData,
        logout, // ✅ exposed
        enterGuestMode,
        userStatus,
        setUserStatus,
        fetchOnlineUsers,
        deviceId,
        getDeviceId,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
