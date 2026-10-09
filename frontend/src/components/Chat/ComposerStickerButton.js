import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import i18n from "../../../i18n";

/**
 * The button at the left of the chat composer that opens the sticker panel.
 *
 * A smiley while the panel is shut; a keyboard while it is open, since pressing
 * it then hands the space back to typing. The two faces turn into one another
 * on a spring — the same idiom as the "+" / send button on the other side — so
 * the control reads as one switch with two positions.
 */
export default function ComposerStickerButton({ active, disabled, onPress }) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: active ? 1 : 0,
      friction: 7,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [active, progress]);

  const pressTo = (toValue) =>
    Animated.spring(press, { toValue, friction: 5, tension: 180, useNativeDriver: true }).start();

  const smileyStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] }),
    transform: [
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-90deg"] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
    ],
  };
  const keyboardStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }),
    transform: [
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["90deg", "0deg"] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
    ],
  };
  const tint = disabled ? "#B0B0B3" : "#1F1F22";

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => !disabled && pressTo(0.88)}
      onPressOut={() => pressTo(1)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={i18n.t(active ? "keyboard" : "stickers")}
      accessibilityState={{ disabled: !!disabled, expanded: !!active }}
      hitSlop={4}
    >
      <Animated.View style={[styles.button, { transform: [{ scale: press }] }]}>
        <Animated.View style={[styles.face, smileyStyle]}>
          <Ionicons name="happy-outline" size={25} color={tint} />
        </Animated.View>
        <Animated.View style={[styles.face, keyboardStyle]}>
          <Ionicons name="keypad-outline" size={22} color={tint} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7E7EA",
    marginRight: 7,
  },
  face: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
