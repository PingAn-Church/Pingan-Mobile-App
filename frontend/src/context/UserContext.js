import React, { createContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { refreshAccessToken, getAuthToken } from "../service/TokenService";
import { fetchUserProfile, getOnlineUsers } from "../service/UserService";
import { logoutUser as logoutService } from "../service/AuthService";
// import { v4 as uuidv4 } from "uuid"; // Import uuid for generating unique IDs
import uuid from 'react-native-uuid';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userReady, setUserReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userStatus, setUserStatus] = useState({});
  const [deviceId, setDeviceId] = useState(null);  

  // Fetch the device ID or generate one if not found
  const getDeviceId = async () => {
    // let deviceId = await SecureStore.getItemAsync("deviceId");
    let deviceId = await AsyncStorage.getItem("deviceId");
    console.log("DEVICE ID VALUE", deviceId);
    // await AsyncStorage.setItem("appLanguage", newLang);
    // const storedLang = await AsyncStorage.getItem("appLanguage");
    if (!deviceId) {
      console.log("SETTING DEVICE ID");
      deviceId = uuid.v4(); // Generate a new deviceId if not found
      console.log("UUIDV4 value", deviceId)
      
      await AsyncStorage.setItem("deviceId", deviceId); // Save it to secure storage
    }
    setDeviceId(deviceId); // Save it to state for global access
  };

  // const fetchUserData = async () => {
  //   try {
  //     const token = await getAuthToken(); // Already handles refresh inside
  //     if (!token) {
  //       console.log("🚫 No valid token, user must log in.");
  //       setUser(null);
  //       setUserReady(false);
  //       return;
  //     }
  
  //     const userInfo = await fetchUserProfile();
  //     setUser(userInfo);
  //     setUserReady(true);
  //   } catch (error) {
  //     console.error("❌ Error fetching user info:", error);
  //     setUser(null);
  //     setUserReady(false);
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  const fetchUserData = async () => {
    if (userReady) return;
  
    try {
      let token = await getAuthToken();
      if (!token) return;
  
      const userInfo = await fetchUserProfile();
      setUser(userInfo);
      setUserReady(true);
    } catch (error) {
      console.error("❌ Error fetching user info:", error);
      setUser(null);
      setUserReady(false);
    } finally {
      setLoading(false);
    }
  };
  

  const fetchOnlineUsers = async () => {
    if (!user?.email) return;
    try {
      const onlineMap = await getOnlineUsers();
      setUserStatus({ ...onlineMap, [user.email]: "online" }); // Mark self online
    } catch (err) {
      console.error("❌ Failed to fetch online users:", err);
    }
  };

  const logout = async () => {
    await logoutService(); // ⬅️ Clears storage + disconnects WebSocket
    await AsyncStorage.removeItem("authToken"); //remove auth token
    await AsyncStorage.removeItem("refreshToken"); //remove refresh token
    // VERIFY: Check if they are actually gone
    const tokenCheck = await AsyncStorage.getItem("authToken");
    if (!tokenCheck) {
      console.log("✅ SUCCESS: authToken removed from storage.");
    } else {
      console.warn("⚠️ WARNING: authToken STILL PERSISTS in storage!");
    }
    setUser(null);
    setUserReady(false);
    setUserStatus({});
  };

  // Get the device ID and then fetch user data
  // useEffect(() => {
  //   const initialize = async () => {
  //     await getDeviceId(); // Fetch the device ID
  //     await fetchUserData(); // Fetch user data after device ID is ready
  //   };

  //   initialize(); // Run async function to initialize the data
  // }, []); // Re-run this effect whenever deviceId is updated

  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      if (hasInitialized) return; // ⛔ Prevent rerun
      setHasInitialized(true);

      await getDeviceId(); 
      await fetchUserData();
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
    // <UserContext.Provider value={{ user, setUser, fetchUserData, loading, userStatus, fetchOnlineUsers, setUserStatus }}>
    <UserContext.Provider
      value={{
        user,
        userReady,
        loading,
        setUser,
        setUserReady,
        fetchUserData,
        logout, // ✅ exposed
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
