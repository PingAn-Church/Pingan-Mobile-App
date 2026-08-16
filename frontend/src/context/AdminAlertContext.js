import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { UserContext } from "./UserContext";
import { getNewMemberCount, markNewMembersSeen } from "../service/UserService";

/**
 * How many people have registered since this admin last looked.
 *
 * A new account can't chat, post or join anything until an admin verifies it,
 * so a sign-up nobody notices is a person stuck at the door. The push notifies
 * whoever has the app installed; this count is what keeps the reminder visible
 * afterwards, on the Settings tab, on the Manage Users tile and on the app icon.
 *
 * Non-admins never poll — the endpoint is admin-only and the count stays 0, so
 * every badge that reads it simply doesn't render.
 */
const AdminAlertContext = createContext({
  newMemberCount: 0,
  refreshNewMembers: () => {},
  clearNewMembers: () => {},
});

export const useAdminAlerts = () => useContext(AdminAlertContext);

// Matches UserContext's permission poll: registrations are rare, we skip ticks
// while backgrounded, and a foreground push already refreshes on arrival, so
// this is a slow safety net rather than the main signal.
const POLL_INTERVAL_MS = 60 * 1000;

export const AdminAlertProvider = ({ children }) => {
  const { user } = useContext(UserContext);
  const [newMemberCount, setNewMemberCount] = useState(0);

  const isAdmin = !!user?.admin;

  const refreshNewMembers = useCallback(async () => {
    if (!isAdmin) return;
    setNewMemberCount(await getNewMemberCount());
  }, [isAdmin]);

  /**
   * Marks everything read. The local count drops immediately rather than
   * waiting for the round trip, so the badge disappears the moment the admin
   * opens the list instead of a beat later.
   */
  const clearNewMembers = useCallback(async () => {
    if (!isAdmin) return;
    setNewMemberCount(0);
    await markNewMembersSeen();
  }, [isAdmin]);

  // Losing admin (or signing out) has to zero the count, otherwise a stale
  // number would sit on the app icon for the next person to use the device.
  useEffect(() => {
    if (!isAdmin) {
      setNewMemberCount(0);
      return;
    }

    refreshNewMembers();

    const intervalId = setInterval(() => {
      if (AppState.currentState === "active") refreshNewMembers();
    }, POLL_INTERVAL_MS);

    const appState = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") refreshNewMembers();
    });

    return () => {
      clearInterval(intervalId);
      appState.remove();
    };
  }, [isAdmin, refreshNewMembers]);

  // A registration that lands while the admin is using the app should move the
  // badge now, not up to a poll interval later.
  useEffect(() => {
    if (!isAdmin) return;
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification?.request?.content?.data ?? {};
      if (data.conversationType === "new-member") refreshNewMembers();
    });
    return () => received.remove();
  }, [isAdmin, refreshNewMembers]);

  return (
    <AdminAlertContext.Provider
      value={{ newMemberCount, refreshNewMembers, clearNewMembers }}
    >
      {children}
    </AdminAlertContext.Provider>
  );
};

export default AdminAlertContext;
