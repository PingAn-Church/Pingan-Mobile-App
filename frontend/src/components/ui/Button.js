import React from "react";
import { ActivityIndicator, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme";
import AppText from "./AppText";

// The app's main button.
//   variant    "primary" (blue, default) | "danger" (red) | "neutral" (grey)
//   size       "lg" (18pt label, default) | "md" (16pt label) | "sm" (14pt label)
//   loading    shows a spinner and blocks taps
//   icon       optional Ionicons name shown before the label
//   fullWidth  stretches to the width of its container (default true)
//   textStyle  extra style for the label (style is for the button box)
export default function Button({
  title,
  onPress,
  variant = "primary",
  size = "lg",
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  style,
  textStyle,
  ...props
}) {
  const styles = useStyles();
  const { colors, sizes } = useTheme();
  const inactive = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.base,
        styles[variant],
        fullWidth && styles.fullWidth,
        inactive && styles.inactive,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <>
          {icon ? (
            <Ionicons name={icon} size={sizes.icon.lg} color={colors.onPrimary} style={styles.icon} />
          ) : null}
          <AppText variant="button" size={size} style={textStyle}>
            {title}
          </AppText>
        </>
      )}
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    minHeight: t.sizes.minTouchTarget,
    paddingVertical: t.components.button.paddingVertical,
    paddingHorizontal: t.components.button.paddingHorizontal,
    borderRadius: t.radius.control,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: t.colors.primary },
  danger: { backgroundColor: t.colors.danger },
  neutral: { backgroundColor: t.colors.neutral },
  fullWidth: { alignSelf: "stretch" },
  inactive: { opacity: t.components.button.disabledOpacity },
  icon: { marginRight: t.spacing.sm },
}));
