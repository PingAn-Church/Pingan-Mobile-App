import React from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import i18n from "../../../i18n";
import { EMOJI_PALETTE, canonicalEmoji, displayEmoji } from "../../utils/reactions";
import { webFontSize } from "../../utils/chatMessageDisplay";

/**
 * The full reaction palette, as a sheet over the chat. The quick row on the
 * long-press menu holds the six people reach for; this holds the rest, grouped
 * the way a keyboard groups them. Picking one closes the sheet. `selected` is
 * the viewer's own reactions on the message, lit so a second tap reads as
 * "take it back".
 */
export default function EmojiPickerSheet({ visible, onClose, onPick, selected = [] }) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const mine = new Set(selected.map(canonicalEmoji));

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={i18n.t("close")} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{i18n.t("moreReactions")}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={i18n.t("close")}>
            <Text style={styles.closeText}>{i18n.t("close")}</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {EMOJI_PALETTE.map((group) => (
            <View key={group.key}>
              <Text style={styles.groupTitle}>{i18n.t(group.labelKey)}</Text>
              <View style={styles.grid}>
                {group.emojis.map((emoji) => {
                  const lit = mine.has(emoji);
                  return (
                    <Pressable
                      key={emoji}
                      onPress={() => onPick?.(emoji, !lit)}
                      style={[styles.cell, lit && styles.cellMine]}
                      accessibilityRole="button"
                      accessibilityLabel={displayEmoji(emoji)}
                      accessibilityState={{ selected: lit }}
                    >
                      <Text style={styles.emoji}>{displayEmoji(emoji)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
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
    maxHeight: "62%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
    // Narrow on a wide web window, so the grid does not stretch across the screen.
    ...(Platform.OS === "web" ? { maxWidth: 560, alignSelf: "center", width: "100%" } : null),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: webFontSize(15),
    fontWeight: "700",
    color: "#111113",
  },
  closeText: {
    fontSize: webFontSize(14),
    color: "#0A84FF",
    fontWeight: "600",
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  groupTitle: {
    fontSize: webFontSize(12),
    fontWeight: "600",
    color: "#8E8E93",
    marginTop: 8,
    marginBottom: 4,
    marginLeft: 6,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: "12.5%",
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  cellMine: {
    backgroundColor: "#E5F0FF",
  },
  emoji: {
    fontSize: 26,
  },
});
