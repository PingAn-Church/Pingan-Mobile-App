import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { refreshAccessToken, getAuthToken } from "../service/TokenService";
import { fetchUserProfile, getOnlineUsers, updateMyLanguage } from "../service/UserService";
import { logoutUser as logoutService } from "../service/AuthService";
import i18n from "../../i18n";
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
      // Report this device's language so server-composed push text matches it.
      if (userInfo && userInfo.language !== i18n.locale) {
        updateMyLanguage(i18n.locale);
      }
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
  // changed. That way surfaces gated on user.verifiedUser (the Chat tab, activities)
  // re-render the moment permissions change, mirroring a fresh sign-in, while a
  // refresh that finds nothing new costs no re-render.
  const refreshUser = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) return null;

      const userInfo = await fetchUserProfile();
      setUser((prev) =>
        prev && JSON.stringify(prev) === JSON.stringify(userInfo) ? prev : userInfo
      );
      setUserReady(true);

      // The server composes push notification text, so it has to know which
      // language this device reads. Reporting it here covers sign-in and heals
      // any drift (reinstall, language changed while signed out) without an
      // extra round trip when the two already agree.
      if (userInfo && userInfo.language !== i18n.locale) {
        updateMyLanguage(i18n.locale);
      }
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

  /**
   * Applies a role change the server pushed over the socket.
   *
   * The whole profile arrives, in the same shape /api/users/profile returns, so
   * there is nothing to go and fetch — being verified, promoted or deactivated
   * takes effect on the next render. Swapped in only when something actually
   * differs, so a redundant announcement costs no re-render.
   */
  const applyPermissionUpdate = useCallback((profile) => {
    if (!profile?.id) return;
    setUser((prev) => {
      // Ignore anything addressed to somebody else — a stale socket delivering
      // into a session that has since signed in as a different account.
      if (!prev || String(prev.id) !== String(profile.id)) return prev;
      return JSON.stringify(prev) === JSON.stringify(profile) ? prev : profile;
    });
  }, []);

  // The socket is dropped while the app is backgrounded, so anything that changed
  // while it was away arrives here instead: one request on foreground, rather
  // than the timer that used to run for every signed-in client every minute.
  useEffect(() => {
    if (!user?.id) return; // nothing to refresh for guests / logged-out users

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") refreshUser();
    });

    return () => subscription.remove();
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
        refreshUser, // force a permission re-check (foreground catch-up + on demand)
        applyPermissionUpdate, // server-pushed role change; see WebSocketProvider
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
