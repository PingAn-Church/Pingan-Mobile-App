import React from "react";
import { TouchableOpacity } from "react-native";
import { useTheme } from "../../theme";
import AppText from "./AppText";

// Tappable text that navigates somewhere ("View all", "Forgot password"...).
// Always at least 44pt tall so it is easy to tap.
//   size      "sm" | "md" (default) | "lg"
//   disabled  greys the text out and ignores taps
export default function TextLink({
  onPress,
  children,
  size,
  disabled = false,
  style,
  textStyle,
  ...props
}) {
  const { sizes } = useTheme();
  const touchArea = { minHeight: sizes.minTouchTarget, justifyContent: "center" };
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="link"
      accessibilityState={{ disabled }}
      style={[touchArea, style]}
      {...props}
    >
      <AppText
        variant="link"
        size={size}
        color={disabled ? "textDisabled" : undefined}
        style={textStyle}
      >
        {children}
      </AppText>
    </TouchableOpacity>
  );
}
