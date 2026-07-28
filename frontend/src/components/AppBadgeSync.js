import { useContext, useEffect } from "react";
import * as Notifications from "expo-notifications";
import { UserContext } from "../context/UserContext";
import { ChatContext } from "../context/ChatContext";

/**
 * Keeps the OS app-icon badge in step with the unread total while the app is
 * running. Renders nothing — a boundary component in the same style as AuthGuard
 * and SessionQueryBoundary, mounted inside ChatProvider.
 *
 * On iOS this is exact. Pushes arriving while the app is closed carry their own
 * badge number (the backend puts it on the payload as aps.badge) and the OS
 * applies it directly; this component takes over the moment the app is alive
 * again, because a live conversation list beats a count frozen at send time.
 *
 * On Android there is no OS-level numeric badge, and nothing here can create one:
 *   - setBadgeCountAsync delegates to ShortcutBadger, which broadcasts to
 *     launchers that implement their own counters (Samsung, Xiaomi, Huawei, Oppo,
 *     Sony, HTC, Nova/Apex). Every permission those need is already merged in by
 *     expo-notifications — no manifest work required.
 *   - Stock Android (Pixel/AOSP) is not in that set. ShortcutBadger throws,
 *     expo-notifications swallows it, and the call is a silent no-op. The only
 *     app-icon indicator there is the notification dot, which the system derives
 *     from an *active* notification and cannot be set to a number.
 *   - The Expo push `badge` field is iOS-only, so a backgrounded Android device
 *     never receives a count either. Adding a background task would not help:
 *     the number is already accurate whenever the app is alive, and the gap is
 *     the launcher's, not ours.
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
