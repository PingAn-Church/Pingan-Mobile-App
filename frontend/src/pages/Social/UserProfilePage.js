import React, { useCallback, useContext, useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { makeStyles, useTheme } from "../../theme";
import { AppText, Avatar, Button, Heading } from "../../components/ui";
import { UserContext } from "../../context/UserContext";
import { ChatContext } from "../../context/ChatContext";
import { LanguageContext } from "../../context/LanguageContext";
import { getUserSummary, startPrivateChat } from "../../service/UserService";
import { blockUser, getBlockStatus, unblockUser } from "../../service/BlockService";
import { confirmAction } from "../../utils/confirmAction";
import { showAlert } from "../../utils/showAlert";
import { formatName } from "../../utils/formatName";
import i18n from "../../../i18n";

/**
 * A member's public profile, reached by tapping their avatar or name on a group
 * message.
 *
 * Deliberately thin: name, photo and roles. It is backed by the summary endpoint
 * rather than the full profile, so nothing here can leak an email address to
 * whoever happens to be in the same group chat.
 */
export default function UserProfilePage() {
  const styles = useStyles();
  const { colors, sizes } = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const userId = route.params?.userId;

  const { user: currentUser } = useContext(UserContext);
  const { conversations } = useContext(ChatContext);
  const { language } = useContext(LanguageContext);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [blockStatus, setBlockStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const isSelf = String(currentUser?.id) === String(userId);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("profile"),
      headerBackTitle: i18n.t("back"),
    });
  }, [navigation, language]);

  useEffect(() => {
    let active = true;

    (async () => {
      setLoading(true);
      try {
        const [summary, status] = await Promise.all([
          getUserSummary(userId),
          // Blocking yourself is not a thing, so don't even ask.
          isSelf ? Promise.resolve(null) : getBlockStatus(userId).catch(() => null),
        ]);
        if (!active) return;
        setProfile(summary);
        setBlockStatus(status);
      } catch (error) {
        console.error("Failed to load profile:", error);
        if (active) setProfile(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId, isSelf]);

  /**
   * Opens the existing direct conversation if there is one, and creates it
   * otherwise — the same rule the new-chat picker follows, so starting a
   * conversation from here never leaves a duplicate behind.
   */
  const handleSendMessage = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const existing = conversations.find(
        (c) =>
          c.conversationType === "private" &&
          (c.participants || []).some((id) => String(id) === String(userId))
      );

      if (existing) {
        navigation.navigate("Chat", { conversationId: existing.conversationId });
        return;
      }

      const response = await startPrivateChat([userId]);
      navigation.navigate("Chat", { conversationId: response.data.conversationId });
    } catch (error) {
      console.error("Failed to start a chat:", error);
      showAlert(i18n.t("error"), i18n.t("unableStartPrivateChat"), [{ text: i18n.t("ok") }]);
    } finally {
      setBusy(false);
    }
  }, [busy, conversations, navigation, userId]);

  const handleToggleBlock = useCallback(async () => {
    if (busy) return;
    const blocked = !!blockStatus?.blockedByMe;

    const confirmed = await confirmAction({
      title: blocked ? i18n.t("unblockUser") : i18n.t("blockUser"),
      message: blocked ? i18n.t("confirmUnblockUser") : i18n.t("confirmBlockUser"),
      confirmText: blocked ? i18n.t("unblockUser") : i18n.t("blockUser"),
      cancelText: i18n.t("cancel"),
      destructive: !blocked,
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      const next = blocked ? await unblockUser(userId) : await blockUser(userId);
      setBlockStatus(next);
      showAlert(
        i18n.t("notice"),
        blocked ? i18n.t("userUnblocked") : i18n.t("userBlocked"),
        [{ text: i18n.t("ok") }]
      );
    } catch (error) {
      console.error("Failed to update block status:", error);
      showAlert(
        i18n.t("error"),
        blocked ? i18n.t("unblockFailed") : i18n.t("blockFailed"),
        [{ text: i18n.t("ok") }]
      );
    } finally {
      setBusy(false);
    }
  }, [blockStatus, busy, userId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
          accessibilityLabel={i18n.t("loading")}
        />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <AppText variant="secondary" style={styles.centeredText}>
          {i18n.t("unknownUser")}
        </AppText>
      </SafeAreaView>
    );
  }

  const badges = [
    profile.isVerifiedUser && { key: "verified", label: i18n.t("verifiedMember"), color: colors.roles.verified },
    profile.isAdmin && { key: "admin", label: i18n.t("admin"), color: colors.roles.admin },
    profile.isInstructor && { key: "instructor", label: i18n.t("instructorRole"), color: colors.roles.instructor },
  ].filter(Boolean);

  const blockedByMe = !!blockStatus?.blockedByMe;
  const blockColor = blockedByMe ? "primary" : "danger";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Avatar uri={profile.profileImage} size="3xl" />

        <Heading level={1} style={styles.centeredText}>
          {formatName(profile.firstName, profile.lastName) || i18n.t("unknownUser")}
        </Heading>

        {badges.length > 0 && (
          <View style={styles.badgeRow}>
            {badges.map((badge) => (
              <View key={badge.key} style={[styles.badge, { backgroundColor: badge.color }]}>
                <AppText variant="badge">{badge.label}</AppText>
              </View>
            ))}
          </View>
        )}

        {/* No actions on your own profile — messaging yourself is not a thing,
            and Settings is where you edit it. */}
        {!isSelf && (
          <>
            <Button
              size="md"
              icon="chatbubble-ellipses"
              fullWidth={false}
              title={i18n.t("sendMessage")}
              onPress={handleSendMessage}
              disabled={busy}
              style={styles.sendButton}
            />

            {/* A block in either direction stops private messaging, so say so
                rather than letting Send Message fail with a generic error. */}
            {blockStatus?.blockedMe && !blockedByMe && (
              <AppText variant="secondary" style={styles.centeredText}>
                {i18n.t("blockedYouNotice")}
              </AppText>
            )}

            <TouchableOpacity
              style={[styles.blockButton, busy && styles.buttonDisabled]}
              onPress={handleToggleBlock}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
            >
              <Ionicons
                name={blockedByMe ? "lock-open-outline" : "ban-outline"}
                size={sizes.icon.sm}
                color={colors[blockColor]}
              />
              <AppText variant="button" size="md" color={blockColor}>
                {blockedByMe ? i18n.t("unblockUser") : i18n.t("blockUser")}
              </AppText>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const ACTION_BUTTON_MIN_WIDTH = 220;

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.background },
  centered: { justifyContent: "center", alignItems: "center" },
  centeredText: { textAlign: "center" },
  content: { alignItems: "center", padding: t.spacing.xl, gap: t.spacing.base },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.spacing.sm,
    justifyContent: "center",
  },
  badge: {
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
    borderRadius: t.radius.full,
  },
  sendButton: {
    marginTop: t.spacing.md,
    minWidth: ACTION_BUTTON_MIN_WIDTH,
  },
  blockButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: t.spacing.sm,
    borderWidth: 1,
    borderColor: t.colors.borderSubtle,
    borderRadius: t.radius.control,
    minHeight: t.sizes.minTouchTarget,
    paddingVertical: t.components.button.paddingVertical,
    paddingHorizontal: t.components.button.paddingHorizontal,
    minWidth: ACTION_BUTTON_MIN_WIDTH,
  },
  buttonDisabled: { opacity: t.components.button.disabledOpacity },
}));
