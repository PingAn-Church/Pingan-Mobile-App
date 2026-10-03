import React from "react";
import { TouchableOpacity } from "react-native";
import { useTheme } from "../../theme";
import AppText from "./AppText";

// Tappable text that navigates somewhere ("View all", "Forgot password"...).
// Always at least 44pt tall so it is easy to tap.
export default function TextLink({ onPress, children, style, textStyle, ...props }) {
  const { sizes } = useTheme();
  const touchArea = { minHeight: sizes.minTouchTarget, justifyContent: "center" };
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="link" style={[touchArea, style]} {...props}>
      <AppText variant="link" style={textStyle}>
        {children}
      </AppText>
    </TouchableOpacity>
  );
}
