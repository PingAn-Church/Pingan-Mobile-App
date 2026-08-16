import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import CachedImage from "../../components/CachedImage";
import defaultProfileImage from "../../../assets/user.png";
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
        <ActivityIndicator size="large" color="#007aff" />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <Text style={styles.muted}>{i18n.t("unknownUser")}</Text>
      </SafeAreaView>
    );
  }

  const badges = [
    profile.isVerifiedUser && { key: "verified", label: i18n.t("verifiedMember"), color: "#10b981" },
    profile.isAdmin && { key: "admin", label: i18n.t("admin"), color: "#3b82f6" },
    profile.isInstructor && { key: "instructor", label: i18n.t("instructorRole"), color: "#8b5cf6" },
  ].filter(Boolean);

  const blockedByMe = !!blockStatus?.blockedByMe;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <CachedImage
          uri={profile.profileImage}
          type="profile"
          fallbackSource={defaultProfileImage}
          style={styles.avatar}
        />

        <Text style={styles.name}>
          {formatName(profile.firstName, profile.lastName) || i18n.t("unknownUser")}
        </Text>

        {badges.length > 0 && (
          <View style={styles.badgeRow}>
            {badges.map((badge) => (
              <View key={badge.key} style={[styles.badge, { backgroundColor: badge.color }]}>
                <Text style={styles.badgeText}>{badge.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* No actions on your own profile — messaging yourself is not a thing,
            and Settings is where you edit it. */}
        {!isSelf && (
          <>
            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.buttonDisabled]}
              onPress={handleSendMessage}
              disabled={busy}
            >
              <Ionicons name="chatbubble-ellipses" size={18} color="#ffffff" />
              <Text style={styles.primaryButtonText}>{i18n.t("sendMessage")}</Text>
            </TouchableOpacity>

            {/* A block in either direction stops private messaging, so say so
                rather than letting Send Message fail with a generic error. */}
            {blockStatus?.blockedMe && !blockedByMe && (
              <Text style={styles.muted}>{i18n.t("blockedYouNotice")}</Text>
            )}

            <TouchableOpacity
              style={[styles.blockButton, busy && styles.buttonDisabled]}
              onPress={handleToggleBlock}
              disabled={busy}
            >
              <Ionicons
                name={blockedByMe ? "lock-open-outline" : "ban-outline"}
                size={18}
                color={blockedByMe ? "#10b981" : "#dc2626"}
              />
              <Text
                style={[
                  styles.blockButtonText,
                  { color: blockedByMe ? "#10b981" : "#dc2626" },
                ]}
              >
                {blockedByMe ? i18n.t("unblockUser") : i18n.t("blockUser")}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { justifyContent: "center", alignItems: "center" },
  content: { alignItems: "center", padding: 24, gap: 14 },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#e5e7eb",
  },
  name: { fontSize: 24, fontWeight: "700", color: "#111827", textAlign: "center" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#007aff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 26,
    marginTop: 10,
    minWidth: 220,
  },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  blockButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 26,
    minWidth: 220,
  },
  blockButtonText: { fontWeight: "600", fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },
  muted: { color: "#6b7280", fontSize: 14, textAlign: "center" },
});
