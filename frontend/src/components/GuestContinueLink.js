import React, { useContext, useState } from "react";
import { ActivityIndicator, Keyboard, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { UserContext } from "../context/UserContext";
import i18n from "../../i18n";

export default function GuestContinueLink() {
  const navigation = useNavigation();
  const { enterGuestMode } = useContext(UserContext);
  const [entering, setEntering] = useState(false);

  const continueAsGuest = async () => {
    if (entering) return;
    setEntering(true);
    try {
      Keyboard.dismiss();
      await enterGuestMode();
      navigation.reset({
        index: 0,
        routes: [{ name: "HomeTabs", params: { screen: "Home" } }],
      });
    } finally {
      setEntering(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.link}
      onPress={continueAsGuest}
      disabled={entering}
      accessibilityRole="button"
      accessibilityLabel={i18n.t("continueAsGuest")}
    >
      {entering ? (
        <ActivityIndicator size="small" color="#007AFF" />
      ) : (
        <Text style={styles.text}>{i18n.t("continueAsGuest")}</Text>
      )}
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
  text: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
