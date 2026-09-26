import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import i18n from "../../../i18n";

const BLUE = "#0A84FF";
const GREEN = "#34C759";
const GREY = "#C7C7CC";

/**
 * The one sign-up button, shared by chat share cards and the event page.
 *
 * Draws four states off a registration status: open ("Register"), registered
 * (green, with a check that pops in), full, and closed. The colour change is
 * animated rather than swapped, and the press shrinks the button slightly, so a
 * tap visibly "lands" even before the server answers.
 *
 * `onPress` is only wired while the button can act: open → register, and —
 * when `onPressRegistered` is given — registered → whatever the host wants
 * (the card opens the event page; the page offers cancellation).
 */
export default function EventRegisterButton({
  status,
  busy = false,
  compact = false,
  onRegister,
  onPressRegistered,
  style,
}) {
  const registered = !!status?.registered;
  const closedReason = status?.closedReason;
  const open = !registered && !closedReason;

  const done = useRef(new Animated.Value(registered ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(done, {
      toValue: registered ? 1 : 0,
      friction: 6,
      tension: 90,
      useNativeDriver: false,
    }).start();
  }, [registered, done]);

  const pressTo = (toValue) =>
    Animated.spring(press, { toValue, friction: 5, tension: 160, useNativeDriver: true }).start();

  // Blue fades to green as the registration lands; closed states are flat grey.
  const backgroundColor =
    open || registered ? done.interpolate({ inputRange: [0, 1], outputRange: [BLUE, GREEN] }) : GREY;
  const checkScale = done.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1.25, 1] });

  const label = registered
    ? i18n.t("eventRegistered")
    : closedReason === "full"
      ? i18n.t("registrationFull")
      : closedReason
        ? i18n.t("registrationClosed")
        : i18n.t("eventRegister");

  const action = open ? onRegister : registered ? onPressRegistered : null;
  const disabled = busy || !action;

  return (
    <Animated.View style={[{ transform: [{ scale: press }] }, style]}>
      <Pressable
        onPress={action || undefined}
        onPressIn={() => !disabled && pressTo(0.95)}
        onPressOut={() => pressTo(1)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy }}
        hitSlop={6}
      >
        <Animated.View
          style={[styles.button, compact ? styles.compact : styles.regular, { backgroundColor }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              {registered && (
                <Animated.View style={{ transform: [{ scale: checkScale }], marginRight: 5 }}>
                  <Ionicons name="checkmark-circle" size={compact ? 16 : 19} color="#FFFFFF" />
                </Animated.View>
              )}
              <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1}>
                {label}
              </Text>
            </>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  regular: {
    minHeight: 46,
    paddingHorizontal: 22,
  },
  compact: {
    minHeight: 34,
    paddingHorizontal: 16,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  labelCompact: {
    fontSize: 15,
  },
});
