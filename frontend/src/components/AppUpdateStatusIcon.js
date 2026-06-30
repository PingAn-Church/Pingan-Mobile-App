import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import i18n from "../../i18n";
import { useAppUpdate } from "../context/AppUpdateContext";
import { showAlert } from "../utils/showAlert";

const iconForStatus = (status, checking) => {
  if (checking) return { name: "sync-circle", color: "#8E8E93", labelKey: "checkingForUpdates" };
  switch (status) {
    case "latest":
      return { name: "checkmark-circle", color: "#2E7D32", labelKey: "appIsLatest" };
    case "available":
      return { name: "sync-circle", color: "#D89B00", labelKey: "appUpdateAvailableTitle" };
    case "unsupported":
      return { name: "alert-circle", color: "#D32F2F", labelKey: "appUpdateRequiredTitle" };
    default:
      return { name: "help-circle", color: "#8E8E93", labelKey: "appUpdateUnknown" };
  }
};

export default function AppUpdateStatusIcon() {
  const {
    status,
    checking,
    error,
    isSupportedPlatform,
    checkForUpdates,
    showUpdatePrompt,
  } = useAppUpdate();

  if (!isSupportedPlatform) return null;

  const icon = iconForStatus(status, checking);

  const handlePress = async () => {
    if (checking) return;

    if (status === "available" || status === "unsupported") {
      showUpdatePrompt();
      return;
    }

    const result = await checkForUpdates({ manual: true });
    if (result?.updateAvailable) return;

    if (result?.status === "unknown") {
      showAlert(i18n.t("error"), result?.error?.message || error?.message || i18n.t("appUpdateCheckFailed"));
      return;
    }

    showAlert(i18n.t("appIsLatest"), i18n.t("appIsLatestMessage"));
  };

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={i18n.t(icon.labelKey)}
      activeOpacity={0.75}
    >
      <Ionicons name={icon.name} size={28} color={icon.color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
});
