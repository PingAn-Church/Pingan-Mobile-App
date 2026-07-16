import React from "react";
import { Keyboard, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import i18n from "../../i18n";

export default function AuthSwitchLink({ promptKey, actionKey, routeName }) {
  const navigation = useNavigation();

  const switchScreen = () => {
    Keyboard.dismiss();
    navigation.replace(routeName);
  };

  return (
    <TouchableOpacity
      style={styles.link}
      onPress={switchScreen}
      accessibilityRole="link"
      accessibilityLabel={`${i18n.t(promptKey)} ${i18n.t(actionKey)}`}
    >
      <Text style={styles.prompt}>
        {i18n.t(promptKey)}{" "}
        <Text style={styles.action}>{i18n.t(actionKey)}</Text>
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  link: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  prompt: {
    color: "#555",
    fontSize: 14,
    textAlign: "center",
  },
  action: {
    color: "#007AFF",
    fontWeight: "700",
  },
});
