import { Alert, Platform } from "react-native";

export const confirmAction = ({
  title,
  message,
  confirmText = "Delete",
  cancelText = "Cancel",
  destructive = true,
}) =>
  new Promise((resolve) => {
    if (Platform.OS === "web" && typeof globalThis?.confirm === "function") {
      const prompt = [title, message].filter(Boolean).join("\n\n");
      resolve(globalThis.confirm(prompt));
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    Alert.alert(
      title,
      message,
      [
        {
          text: cancelText,
          style: "cancel",
          onPress: () => finish(false),
        },
        {
          text: confirmText,
          style: destructive ? "destructive" : "default",
          onPress: () => finish(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => finish(false),
      }
    );
  });
