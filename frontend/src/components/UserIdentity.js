import React from "react";
import { View, Text, StyleSheet } from "react-native";

/**
 * A user's name with their email as small, muted subtext underneath.
 *
 * Used on admin/management lists and the event check-in list to disambiguate
 * people who share the same name — a common source of confusion after mistyped-
 * email sign-ups.
 *
 * Email is an app-admin-only view: it renders only when `showEmail` is true AND
 * the user actually has one. Admin-only screens can rely on the default; screens
 * reachable by non-admins (e.g. the event check-in list) must pass
 * `showEmail={viewerIsAdmin}` so a regular member never sees others' emails.
 *
 * Pass the screen's existing name style via `nameStyle` so the name keeps its
 * original look; only the email line is added.
 */
export default function UserIdentity({
  user,
  nameStyle,
  suffix = "",
  containerStyle,
  showEmail = true,
}) {
  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const email = typeof user?.email === "string" ? user.email.trim() : "";

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={[styles.name, nameStyle]} numberOfLines={1}>
        {firstName} {lastName}
        {suffix}
      </Text>
      {showEmail && email ? (
        <Text style={styles.email} numberOfLines={1}>
          {email}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },
  name: {
    fontSize: 16,
    color: "#1f2937",
  },
  email: {
    marginTop: 2,
    fontSize: 12,
    color: "#9ca3af",
  },
});
