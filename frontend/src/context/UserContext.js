import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { refreshAccessToken, getAuthToken } from "../service/TokenService";
import { fetchUserProfile, getOnlineUsers } from "../service/UserService";
import { logoutUser as logoutService } from "../service/AuthService";
// import { v4 as uuidv4 } from "uuid"; // Import uuid for generating unique IDs
import uuid from 'react-native-uuid';

export const UserContext = createContext();
const GUEST_MODE_KEY = "guestMode";
// How often to silently re-check the signed-in user's permissions (verification,
// role, active status) so a server-side change — e.g. an admin verifying the
// account — unlocks the UI without a re-login. Kept deliberately infrequent:
// permission changes are rare, we skip polling while backgrounded, and we also
// refresh on foreground, so this is just a slow safety net.
const PERMISSION_POLL_INTERVAL_MS = 60 * 1000;

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

  // Force a fresh profile fetch — unlike fetchUserData, this does NOT short-circuit
  // once a user is loaded — and swap it into context only when something actually
  // changed. That way pages gated on user.verifiedUser (SocialPage, activities)
  // re-render the moment permissions change, mirroring a fresh sign-in, while
  // unchanged polls cause no re-render.
  const refreshUser = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) return null;

      const userInfo = await fetchUserProfile();
      setUser((prev) =>
        prev && JSON.stringify(prev) === JSON.stringify(userInfo) ? prev : userInfo
      );
      setUserReady(true);
      return userInfo;
    } catch (error) {
      // Transient failures (network blips, token-refresh races) must not drop the
      // session — keep the current user and try again on the next tick.
      console.warn(
        "⚠️ Permission refresh failed, keeping current session:",
        error?.message || error
      );
      return null;
    }
  }, []);

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

  // Poll for permission changes while signed in. Depending on user?.id (not the
  // whole user object) keeps the interval steady across profile updates — it only
  // restarts on login/logout — so a verification flip doesn't tear it down. We
  // skip ticks while backgrounded, and refresh immediately on foreground so a
  // change made while the app was away shows up right away instead of up to a
  // full interval later.
  useEffect(() => {
    if (!user?.id) return; // nothing to refresh for guests / logged-out users

    const intervalId = setInterval(() => {
      if (AppState.currentState === "active") refreshUser();
    }, PERMISSION_POLL_INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") refreshUser();
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [user?.id, refreshUser]);

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
        refreshUser, // force a permission re-check (used by polling + on demand)
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
