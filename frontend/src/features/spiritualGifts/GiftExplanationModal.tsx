import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import i18n from "../../../i18n";
import type { SpiritualGiftDefinition, SupportedLanguage } from "./spiritualGiftData";

interface Props {
  gift: SpiritualGiftDefinition | null;
  language: SupportedLanguage;
  onClose: () => void;
}

export default function GiftExplanationModal({ gift, language, onClose }: Props) {
  return (
    <Modal visible={!!gift} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.dialog}>
          <View style={styles.header}>
            <Text style={styles.title}>{gift?.name[language]}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={i18n.t("close")}
              style={styles.closeButton}
              onPress={onClose}
            >
              <Ionicons name="close" size={22} color="#344054" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.description}>{gift?.description[language]}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "72%",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { flex: 1, color: "#17212B", fontSize: 20, fontWeight: "800" },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
  },
  description: { color: "#475467", fontSize: 15, lineHeight: 24 },
});
