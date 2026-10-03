import React from "react";
import { TouchableOpacity } from "react-native";
import AppText from "./AppText";

// Tappable text that navigates somewhere ("View all", "Forgot password"...).
export default function TextLink({ onPress, children, style, textStyle, ...props }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="link" style={style} {...props}>
      <AppText variant="link" style={textStyle}>
        {children}
      </AppText>
    </TouchableOpacity>
  );
}
