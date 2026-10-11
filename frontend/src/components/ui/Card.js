import React from "react";
import { TouchableOpacity, View } from "react-native";
import { makeStyles } from "../../theme";

// A bordered, rounded box. Pass onPress to make the whole card tappable.
//   variant  "subtle" (light grey) | "default" (white)
//   elevated adds the card shadow
//   padded   adds the standard inner padding (turn off for edge-to-edge images)
//   accent   adds a coloured stripe down the left edge (list items like events)
export default function Card({
  variant = "subtle",
  elevated = false,
  padded = true,
  accent = false,
  onPress,
  style,
  children,
  ...props
}) {
  const styles = useStyles();
  const cardStyle = [
    styles.base,
    styles[variant],
    padded && styles.padded,
    elevated && styles.elevated,
    accent && styles.accent,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity style={cardStyle} onPress={onPress} {...props}>
        {children}
      </TouchableOpacity>
    );
  }
  return (
    <View style={cardStyle} {...props}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    borderRadius: t.radius.card,
    borderWidth: t.components.card.borderWidth,
    borderColor: t.colors.borderSubtle,
  },
  subtle: { backgroundColor: t.colors.surfaceSubtle },
  default: { backgroundColor: t.colors.background },
  padded: { padding: t.components.card.padding },
  elevated: t.shadows.card,
  accent: {
    borderLeftWidth: t.components.card.accentWidth,
    borderLeftColor: t.colors.primary,
  },
}));
