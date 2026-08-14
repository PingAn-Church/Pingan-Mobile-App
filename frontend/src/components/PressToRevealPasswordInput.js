import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import i18n from "../../i18n";

export default function PressToRevealPasswordInput({
  containerStyle,
  inputStyle,
  onBlur,
  ...inputProps
}) {
  const [revealed, setRevealed] = useState(false);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  // The reveal control is focusable, so on web pressing it pulls focus off the
  // field: the resulting onBlur lands in the same batch as onPressIn and would
  // undo the reveal before it ever paints. Blur only hides when the focus is
  // genuinely leaving for somewhere else.
  const interactingRef = useRef(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (active) setScreenReaderEnabled(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      (enabled) => setScreenReaderEnabled(enabled)
    );

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  const hidePassword = () => setRevealed(false);

  const beginInteraction = () => {
    interactingRef.current = true;
    // Hold-to-reveal is unusable under a screen reader, which activates a button
    // rather than holding it — those users get a toggle through onPress instead.
    if (!screenReaderEnabled) setRevealed(true);
  };

  const endInteraction = () => {
    if (!screenReaderEnabled) hidePassword();
    // Released on the next tick so the onPress that follows onPressOut still
    // counts as part of this interaction rather than as focus leaving.
    setTimeout(() => {
      interactingRef.current = false;
    }, 0);
  };

  const revealLabel = screenReaderEnabled
    ? i18n.t(revealed ? "hidePasswordAction" : "showPasswordAction")
    : i18n.t("holdToRevealPassword");
  const revealHint = screenReaderEnabled
    ? i18n.t("tapToTogglePassword")
    : i18n.t("releaseToHidePassword");

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        {...inputProps}
        secureTextEntry={!revealed}
        autoCorrect={false}
        onBlur={(event) => {
          if (!interactingRef.current) hidePassword();
          onBlur?.(event);
        }}
        style={[styles.input, inputStyle]}
      />
      <Pressable
        style={({ pressed }) => [styles.revealButton, pressed && styles.revealButtonPressed]}
        onPressIn={beginInteraction}
        onPressOut={endInteraction}
        onPress={screenReaderEnabled ? () => setRevealed((value) => !value) : undefined}
        onHoverOut={endInteraction}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityState={screenReaderEnabled ? { selected: revealed } : undefined}
        accessibilityLabel={revealLabel}
        accessibilityHint={revealHint}
      >
        <Ionicons
          name={revealed ? "eye-off-outline" : "eye-outline"}
          size={22}
          color="#667085"
        />
      </Pressable>
    </View>
  );
}

// The border, radius and padding below deliberately mirror the plain `input`
// style each screen uses for its other fields, with the border moved from the
// TextInput onto the row that wraps it. Nothing here may set a background or a
// minimum height: the surrounding fields are transparent and sized purely by
// their own padding, so either one would make the password box stand out.
const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 10,
    fontSize: 18,
  },
  revealButton: {
    width: 44,
    // Stretching fills the row the TextInput sized, giving a full-height touch
    // target without the button itself making the field taller.
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  revealButtonPressed: {
    opacity: 0.65,
  },
});
