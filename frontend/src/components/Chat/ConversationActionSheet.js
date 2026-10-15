import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import i18n from "../../../i18n";
import { webFontSize } from "../../utils/chatMessageDisplay";

/**
 * Actions on one chat-list row, opened by a long-press on it: pin or unpin,
 * mute or unmute, delete. On a phone the same actions sit behind a swipe (see
 * SwipeableRow); a sheet rather than an alert so the web, which has no swipe,
 * gets the full set with the same words.
 *
 * @param {{ visible: boolean, title?: string, actions: Array, onClose: Function }} props
 *   `actions` are [{ key, label, icon, destructive?, onPress }].
 */
export default function ConversationActionSheet({ visible, title, actions = [], onClose }) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={i18n.t("close")} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {!!title && (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        )}
        {actions.map((action) => (
          <Pressable
            key={action.key}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
            onPress={() => {
              onClose?.();
              action.onPress?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            {!!action.icon && (
              <Ionicons
                name={action.icon}
                size={20}
                color={action.destructive ? "#DC2626" : "#111827"}
                style={styles.actionIcon}
              />
            )}
            <Text style={[styles.actionLabel, action.destructive && styles.actionLabelDestructive]}>
              {action.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={({ pressed }) => [styles.action, styles.cancel, pressed && styles.actionPressed]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={i18n.t("cancel")}
        >
          <Text style={styles.cancelLabel}>{i18n.t("cancel")}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    ...(Platform.OS === "web" ? { maxWidth: 480, alignSelf: "center", width: "100%" } : null),
  },
  title: {
    fontSize: webFontSize(13),
    fontWeight: "600",
    color: "#8E8E93",
    textAlign: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  actionPressed: {
    backgroundColor: "#F5F5F7",
  },
  actionIcon: {
    marginRight: 14,
  },
  actionLabel: {
    fontSize: webFontSize(16),
    color: "#111827",
  },
  actionLabelDestructive: {
    color: "#DC2626",
  },
  cancel: {
    justifyContent: "center",
    borderTopWidth: 6,
    borderTopColor: "#F2F2F7",
  },
  cancelLabel: {
    fontSize: webFontSize(16),
    fontWeight: "600",
    color: "#111827",
  },
});
