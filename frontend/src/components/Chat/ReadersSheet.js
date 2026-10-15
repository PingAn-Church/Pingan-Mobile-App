import React from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import i18n from "../../../i18n";
import CachedImage from "../CachedImage";
import defaultProfileImage from "../../../assets/user.png";
import { webFontSize } from "../../utils/chatMessageDisplay";

/**
 * Who has read one of your group messages and who has not yet, worked out from
 * the members' read watermarks (see ChatPage). Names come from the roster the
 * screen already holds; the church-wide group ships none, so there the sheet
 * gives the numbers and says why there are no names.
 *
 * @param {{ visible: boolean, onClose: Function, readers: Array, unreaders: Array,
 *   readCount: number, total: number, rosterHidden?: boolean }} props
 *   `readers` / `unreaders` are [{ id, fullName, profileImage }].
 */
export default function ReadersSheet({
  visible,
  onClose,
  readers = [],
  unreaders = [],
  readCount = 0,
  total = 0,
  rosterHidden = false,
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const section = (title, count, people) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {title} · {count}
      </Text>
      {rosterHidden ? null : people.length ? (
        people.map((person) => (
          <View key={String(person.id)} style={styles.personRow}>
            <CachedImage
              uri={person.profileImage || null}
              type="profile"
              fallbackSource={defaultProfileImage}
              style={styles.avatar}
            />
            <Text style={styles.personName} numberOfLines={1}>
              {person.fullName || i18n.t("unknownUser")}
            </Text>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>{i18n.t("noOneYet")}</Text>
      )}
    </View>
  );

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={i18n.t("close")} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{i18n.t("readByCount", { count: readCount })}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={i18n.t("close")}>
            <Text style={styles.closeText}>{i18n.t("close")}</Text>
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {rosterHidden && <Text style={styles.note}>{i18n.t("readersHiddenNote")}</Text>}
          {section(i18n.t("readersTitle"), readCount, readers)}
          {section(i18n.t("unreadersTitle"), Math.max(0, total - readCount), unreaders)}
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
    maxHeight: "70%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
    ...(Platform.OS === "web" ? { maxWidth: 560, alignSelf: "center", width: "100%" } : null),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
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
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  note: {
    fontSize: webFontSize(13),
    color: "#8E8E93",
    marginTop: 10,
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: webFontSize(12),
    fontWeight: "700",
    color: "#8E8E93",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    backgroundColor: "#E5E5EA",
  },
  personName: {
    flex: 1,
    fontSize: webFontSize(15),
    color: "#111113",
  },
  emptyText: {
    fontSize: webFontSize(14),
    color: "#8E8E93",
    paddingVertical: 6,
  },
});
