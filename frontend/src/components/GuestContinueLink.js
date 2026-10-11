import React, { useContext, useState } from "react";
import { ActivityIndicator, Keyboard, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { UserContext } from "../context/UserContext";
import i18n from "../../i18n";
import { makeStyles, useTheme } from "../theme";
import { AppText } from "./ui";

// "Continue as guest" — enters the app without an account.
export default function GuestContinueLink() {
  const styles = useStyles();
  const { colors } = useTheme();
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
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <AppText variant="link" size="sm">
          {i18n.t("continueAsGuest")}
        </AppText>
      )}
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((t) => ({
  link: {
    minHeight: t.sizes.minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: t.spacing.md,
  },
}));
