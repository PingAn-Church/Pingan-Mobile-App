import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import i18n from "../../../i18n";

/**
 * The button at the right of the chat composer, which changes job with the
 * input: "+" (open the actions panel) while the box is empty, a paper plane
 * (send) once there is text, and a check while editing a message.
 *
 * The two faces cross-fade and turn into each other on one spring rather than
 * swapping, and the background shifts from the neutral "+" grey to send blue,
 * so the change reads as the same control changing mode — not as a different
 * button appearing under the thumb mid-type.
 */
export default function ComposerActionButton({ mode, disabled: disabledProp, busy, onPress, style }) {
  const sendMode = mode !== "plus";
  // A send in flight holds the button, as the old send button did.
  const disabled = !!disabledProp || !!busy;
  const progress = useRef(new Animated.Value(sendMode ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: sendMode ? 1 : 0,
      friction: 7,
      tension: 120,
      useNativeDriver: false,
    }).start();
  }, [sendMode, progress]);

  const pressTo = (toValue) =>
    Animated.spring(press, { toValue, friction: 5, tension: 180, useNativeDriver: false }).start();

  const backgroundColor = busy
    ? "#0A84FF"
    : disabled
      ? sendMode
        ? "#C4C8D0"
        : "#E7E7EA"
      : progress.interpolate({ inputRange: [0, 1], outputRange: ["#E7E7EA", "#0A84FF"] });

  const plusStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] }),
    transform: [
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
    ],
  };
  const sendStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }),
    transform: [
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ["-60deg", "0deg"] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
    ],
  };

  const accessibilityLabel =
    mode === "plus" ? i18n.t("chatMoreActions") : mode === "edit" ? i18n.t("save") : i18n.t("send");

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => !disabled && pressTo(0.9)}
      onPressOut={() => pressTo(1)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      hitSlop={4}
    >
      <Animated.View style={[styles.button, style, { backgroundColor, transform: [{ scale: press }] }]}>
        {busy ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Animated.View style={[styles.face, plusStyle]}>
              <Ionicons name="add" size={26} color={disabled ? "#B0B0B3" : "#1F1F22"} />
            </Animated.View>
            <Animated.View style={[styles.face, sendStyle]}>
              <Ionicons name={mode === "edit" ? "checkmark" : "paper-plane"} size={20} color="#FFFFFF" />
            </Animated.View>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    // Same footprint in both modes, so the input beside it never jumps.
    minWidth: 52,
    minHeight: 40,
    borderRadius: 20,
    marginLeft: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  face: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
