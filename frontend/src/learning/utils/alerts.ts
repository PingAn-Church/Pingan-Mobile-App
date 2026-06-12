import { Alert, Platform } from "react-native";

// react-native-web ships Alert.alert as a no-op, so alerts (and especially
// confirmation buttons) never appear in a browser. Route through
// window.alert/confirm on web so the same flows work on every platform.

export const notify = (title: string, message?: string, onDismiss?: () => void) => {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n\n${message}` : title);
    onDismiss?.();
    return;
  }
  Alert.alert(title, message, onDismiss ? [{ text: "OK", onPress: onDismiss }] : undefined);
};

export const confirmDestructive = (
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void
) => {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
};
