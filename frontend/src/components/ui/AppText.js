import React from "react";
import { Text } from "react-native";
import { useTheme } from "../../theme";

// All app text. Pick a role with `variant`; override colour, weight or size with
// a token name (e.g. color="primary", weight="semibold", size="sm") instead of a
// raw value.
export default function AppText({ variant = "body", color, weight, size, style, ...props }) {
  const theme = useTheme();
  const v = theme.textVariants[variant] ?? theme.textVariants.body;

  const base = {
    fontSize: v.fontSize,
    color: theme.colors[color ?? v.color],
  };
  if (v.fontWeight) base.fontWeight = v.fontWeight;
  if (v.lineHeight) base.lineHeight = v.lineHeight;
  if (weight) base.fontWeight = theme.typography.fontWeight[weight];
  if (size) base.fontSize = theme.typography.fontSize[size];

  return <Text style={[base, style]} {...props} />;
}
