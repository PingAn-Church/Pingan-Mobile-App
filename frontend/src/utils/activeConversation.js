import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";

// Tracks which chat conversation is currently on screen. The foreground
// notification handler in App.js reads this to silence chat pushes for the
// conversation the user is already looking at; pushes for other conversations
// (or received while the app is backgrounded) still display normally.
let activeConversationId = null;

/**
 * Removes this conversation's notifications from the system tray.
 *
 * The foreground handler only suppresses pushes that arrive while the app is
 * open — anything delivered while it was backgrounded is displayed by the OS
 * directly and just sits there. Tapping the notification auto-dismisses it, but
 * opening the app from the launcher and reading the chat used to leave a stale
 * "new message" in the tray. Matching on the payload's conversationId keeps
 * notifications for OTHER conversations untouched. Best-effort: tray cleanup is
 * a nicety and must never break entering a chat.
 */
const dismissDeliveredNotifications = async (conversationId) => {
  if (Platform.OS === "web" || conversationId == null) return;
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((notification) => {
          const data = notification?.request?.content?.data ?? {};
          return (
            (data.conversationType === "private" || data.conversationType === "group") &&
            String(data.conversationId) === String(conversationId)
          );
        })
        .map((notification) =>
          Notifications.dismissNotificationAsync(notification.request.identifier)
        )
    );
  } catch (error) {
    // Ignore — the notification simply stays until the OS or user clears it.
  }
};

export function setActiveConversation(conversationId) {
  activeConversationId = conversationId == null ? null : String(conversationId);
  dismissDeliveredNotifications(activeConversationId);
}

export function clearActiveConversation() {
  activeConversationId = null;
}

export function isConversationActive(conversationId) {
  return conversationId != null && String(conversationId) === activeConversationId;
}

// Returning to the foreground with a chat still open: notifications for it may
// have accumulated while the app was backgrounded (the suppression handler never
// saw them), and navigation focus doesn't re-fire on foreground — so re-run the
// cleanup here. Module-level because this file is already the app-wide singleton
// for "which chat is on screen"; native only, and never registered on web.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (nextState) => {
    if (nextState === "active" && activeConversationId != null) {
      dismissDeliveredNotifications(activeConversationId);
    }
  });
}
