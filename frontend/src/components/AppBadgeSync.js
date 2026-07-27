import { useContext, useEffect } from "react";
import * as Notifications from "expo-notifications";
import { UserContext } from "../context/UserContext";
import { ChatContext } from "../context/ChatContext";

/**
 * Keeps the OS app-icon badge in step with the unread total while the app is
 * running. Renders nothing — a boundary component in the same style as AuthGuard
 * and SessionQueryBoundary, mounted inside ChatProvider.
 *
 * Pushes that arrive while the app is closed carry their own badge number (the
 * backend puts it on the payload) and the OS applies it directly. This component
 * takes over the moment the app is alive again, because a live conversation list
 * is more accurate than a count frozen at send time.
 */
const AppBadgeSync = () => {
  const { user, loading: sessionLoading } = useContext(UserContext);
  const { totalUnread, loading: conversationsLoading } = useContext(ChatContext);

  useEffect(() => {
    // Cold start: the session check hasn't settled, so we don't yet know whether
    // there's a user. Writing anything here would wipe a badge the OS set from a
    // push that arrived while the app was closed.
    if (sessionLoading) return;

    // Signed out or browsing as a guest — nothing of theirs is waiting. Covers
    // logout, where ChatContext also clears the conversation list.
    if (!user) {
      setBadge(0);
      return;
    }

    // Wait for the first conversation load; until it lands totalUnread is 0 only
    // because we haven't counted yet.
    if (conversationsLoading) return;

    setBadge(totalUnread);
  }, [user, sessionLoading, conversationsLoading, totalUnread]);

  return null;
};

// Best-effort: the badge is a nicety, and it is a no-op on web outside an
// installed PWA and on Android launchers that don't support counts.
const setBadge = (count) => {
  Notifications.setBadgeCountAsync(count).catch((error) => {
    console.warn("⚠️ Could not set the app badge:", error?.message || error);
  });
};

export default AppBadgeSync;
