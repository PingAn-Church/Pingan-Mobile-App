import { Alert, Platform } from "react-native";

export const showAlert = (title, message, buttons = [{ text: "OK" }], options = {}) => {
  if (Platform.OS === "web" && typeof globalThis?.alert === "function") {
    const prompt = [title, message].filter(Boolean).join("\n\n");
    globalThis.alert(prompt);
    return;
  }

  Alert.alert(title, message, buttons, options);
};
