import React, { useEffect, useRef, useState } from "react";
import { Animated, LayoutAnimation, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { messagePreview } from "../../utils/messageKinds";
import { senderDisplayName } from "../../utils/chatMessageDisplay";

/**
 * The group notice, pinned above the conversation.
 *
 * One line when folded (who said it and the start of what), the whole excerpt
 * and who pinned it when open. The chevron folds and unfolds it; a tap on the
 * text jumps to the pinned message; admins hold it for the management options.
 * Folding is remembered per pinned message, so a notice someone has already
 * tucked away stays tucked away until a new one is pinned.
 */
export default function GroupNoticeBanner({ notice, language, canManage, onOpen, onManage }) {
  const [folded, setFolded] = useState(false);
  const foldedFor = useRef(null);
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!notice) return;
    // A different message was pinned: show it open.
    if (foldedFor.current !== notice.messageId) {
      foldedFor.current = notice.messageId;
      setFolded(false);
    }
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [notice?.messageId, appear]);

  if (!notice?.message) return null;

  const quoted = notice.message;
  const body = quoted.hidden ? i18n.t("reportedPendingReview") : messagePreview(quoted);
  const speaker = senderDisplayName(quoted, language);
  const pinnedBy = formatName(notice.pinnedByFirstName, notice.pinnedByLastName);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, "easeInEaseOut", "opacity"));
    setFolded((value) => !value);
  };

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          opacity: appear,
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        },
      ]}
    >
      <Pressable
        style={styles.body}
        onPress={() => onOpen?.(notice)}
        onLongPress={canManage ? () => onManage?.(notice) : undefined}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`${i18n.t("groupNotice")}: ${speaker}: ${body}`}
      >
        <View style={styles.icon}>
          <Ionicons name="pin" size={16} color="#B26A00" />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {i18n.t("groupNotice")}
            {folded ? ` · ${speaker}` : ""}
          </Text>
          <Text style={[styles.preview, quoted.hidden && styles.previewHidden]} numberOfLines={folded ? 1 : 4}>
            {folded ? body : `${speaker}: ${body}`}
          </Text>
          {!folded && !!pinnedBy && (
            <Text style={styles.meta} numberOfLines={1}>
              {i18n.t("pinnedBy", { name: pinnedBy })}
            </Text>
          )}
        </View>
      </Pressable>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        style={styles.chevron}
        accessibilityRole="button"
        accessibilityLabel={folded ? i18n.t("expand") : i18n.t("collapse")}
      >
        <Ionicons name={folded ? "chevron-down" : "chevron-up"} size={20} color="#8E8E93" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    borderBottomWidth: 1,
    borderBottomColor: "#F1DFA3",
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
  },
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  icon: {
    width: 22,
    paddingTop: 1,
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B26A00",
    marginBottom: 1,
  },
  preview: {
    fontSize: 14,
    color: "#3C3C43",
    lineHeight: 19,
  },
  previewHidden: {
    fontStyle: "italic",
    color: "#8E8E93",
  },
  meta: {
    marginTop: 3,
    fontSize: 12,
    color: "#8E8E93",
  },
  chevron: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
