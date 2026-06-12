import { Alert, Platform } from "react-native";

/**
 * Drop-in replacement for Alert.alert that also works on react-native-web,
 * where Alert.alert is a silent no-op (button callbacks never fire, so any
 * confirmation-gated action simply does nothing).
 *
 * Native: delegates to Alert.alert unchanged.
 * Web:
 *   - 0–1 buttons  -> window.alert, then the button's onPress.
 *   - 2+  buttons  -> window.confirm; OK runs the primary action (last
 *     non-cancel button), Cancel runs the cancel button's handler. Three-way
 *     alerts degrade to confirm/cancel — keep web flows to two choices.
 */
export const showAlert = (title, message, buttons = [{ text: "OK" }], options = {}) => {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons, options);
    return;
  }

  const prompt = [title, message].filter(Boolean).join("\n\n");
  const list = Array.isArray(buttons) && buttons.length ? buttons : [{ text: "OK" }];

  if (list.length === 1) {
    if (typeof globalThis?.alert === "function") globalThis.alert(prompt);
    list[0]?.onPress?.();
    return;
  }

  const cancelButton = list.find((b) => b?.style === "cancel") || null;
  const primaryButton = [...list].reverse().find((b) => b !== cancelButton) || null;
  const confirmed =
    typeof globalThis?.confirm === "function" ? globalThis.confirm(prompt) : true;

  if (confirmed) {
    primaryButton?.onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
};
