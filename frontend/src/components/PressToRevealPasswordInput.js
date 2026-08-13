import React, { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import i18n from "../../i18n";

export default function PressToRevealPasswordInput({
  containerStyle,
  inputStyle,
  onBlur,
  ...inputProps
}) {
  const [revealed, setRevealed] = useState(false);

  const hidePassword = () => setRevealed(false);

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        {...inputProps}
        secureTextEntry={!revealed}
        autoCorrect={false}
        onBlur={(event) => {
          hidePassword();
          onBlur?.(event);
        }}
        style={[styles.input, inputStyle]}
      />
      <Pressable
        style={({ pressed }) => [styles.revealButton, pressed && styles.revealButtonPressed]}
        onPressIn={() => setRevealed(true)}
        onPressOut={hidePassword}
        onHoverOut={hidePassword}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("holdToRevealPassword")}
        accessibilityHint={i18n.t("releaseToHidePassword")}
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

const styles = StyleSheet.create({
  container: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 18,
  },
  revealButton: {
    width: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  revealButtonPressed: {
    opacity: 0.65,
  },
});
