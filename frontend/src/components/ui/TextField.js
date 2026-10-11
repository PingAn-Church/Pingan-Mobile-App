import React from "react";
import { TextInput } from "react-native";
import { makeStyles, useTheme } from "../../theme";

// Single-line text input. Takes every normal TextInput prop.
//   size     "md" (16pt, default) | "lg" (18pt, used on sign-in forms)
//   variant  "default" | "code" (large, spaced, centred — for one-time codes)
export default function TextField({ size = "md", variant = "default", style, ...props }) {
  const styles = useStyles();
  const { colors, typography } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textSecondary}
      accessibilityLabel={props.accessibilityLabel ?? props.placeholder}
      style={[
        styles.base,
        { fontSize: typography.fontSize[size] },
        variant === "code" && styles.code,
        style,
      ]}
      {...props}
    />
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    borderWidth: t.components.input.borderWidth,
    borderColor: t.colors.border,
    borderRadius: t.radius.control,
    padding: t.components.input.padding,
    color: t.colors.textPrimary,
  },
  code: {
    fontSize: t.components.input.codeFontSize,
    letterSpacing: t.components.input.codeLetterSpacing,
    textAlign: "center",
  },
}));
