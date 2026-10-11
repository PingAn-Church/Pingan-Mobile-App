import React from "react";
import { Keyboard, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import i18n from "../../i18n";
import { makeStyles } from "../theme";
import { AppText } from "./ui";

// "New to us? Register here" / "Already have an account? Log in here".
export default function AuthSwitchLink({ promptKey, actionKey, routeName }) {
  const styles = useStyles();
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
      <AppText variant="secondary" style={styles.prompt}>
        {i18n.t(promptKey)}{" "}
        <AppText variant="link" size="sm" weight="bold">
          {i18n.t(actionKey)}
        </AppText>
      </AppText>
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
  prompt: {
    textAlign: "center",
  },
}));
