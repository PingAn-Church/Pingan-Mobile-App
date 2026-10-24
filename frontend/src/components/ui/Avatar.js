import React from "react";
import { Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeStyles, useTheme } from "../../theme";
import CachedImage from "../CachedImage";
import defaultProfileImage from "../../../assets/user.png";

// Round picture for a person or group.
//   uri             stored image path (shows the default user image when empty)
//   source          image bundled with the app (an imported file, e.g. the app icon) — used instead of uri
//   type            "profile" (default) | "group"
//   conversationId  required for group icons
//   size            "sm" | "md" | "lg" (default) | "xl" | "2xl" | "3xl" | "4xl"
//   icon            Ionicons name — draws an icon in a coloured circle instead of a photo
//   color           colour token for the icon circle, e.g. "primary" or "chat.topicsAvatar"
//   bordered        adds the subtle 1px border
export default function Avatar({
  uri,
  source,
  type = "profile",
  conversationId,
  size = "lg",
  icon,
  color = "primary",
  bordered = false,
  style,
  ...props
}) {
  const styles = useStyles();
  const { colors, sizes } = useTheme();
  const px = sizes.avatar[size] ?? sizes.avatar.lg;
  const box = [styles.base, { width: px, height: px }, bordered && styles.bordered, style];

  if (icon) {
    return (
      <View style={[box, styles.icon, { backgroundColor: colorToken(colors, color) }]} {...props}>
        <Ionicons name={icon} size={Math.round(px * ICON_RATIO)} color={colors.onPrimary} />
      </View>
    );
  }

  // Bundled images are already on the device, so they skip CachedImage's download.
  if (source) {
    return <Image source={source} style={[box, styles.photo]} {...props} />;
  }

  return (
    <CachedImage
      uri={uri || null}
      type={type}
      conversationId={type === "group" ? conversationId : undefined}
      fallbackSource={defaultProfileImage}
      style={[box, styles.photo]}
      {...props}
    />
  );
}

// Icon fills about half the circle (24–26pt in a 54pt avatar).
const ICON_RATIO = 0.48;

// Accepts nested token names like "chat.topicsAvatar".
function colorToken(colors, name) {
  return name.split(".").reduce((group, key) => group?.[key], colors) ?? colors.primary;
}

const useStyles = makeStyles((t) => ({
  base: { borderRadius: t.radius.full, overflow: "hidden" },
  photo: { backgroundColor: t.colors.placeholder },
  icon: { alignItems: "center", justifyContent: "center" },
  bordered: { borderWidth: 1, borderColor: t.colors.borderSubtle },
}));
