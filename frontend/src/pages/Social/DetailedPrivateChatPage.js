import { showAlert } from "../../utils/showAlert";
import React, { useEffect, useState, useContext } from "react";
import { SafeAreaView, View, ActivityIndicator, Alert } from "react-native";
import { getUserById } from "../../service/UserService";
import { deleteConversationFromDatabase } from "../../service/ChatService";
import { blockUser, unblockUser, getBlockStatus } from "../../service/BlockService";
import { useNavigation } from "@react-navigation/native";
import { ChatContext } from "../../context/ChatContext";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { LanguageContext } from "../../context/LanguageContext";
import { makeStyles, useTheme } from "../../theme";
import { AppText, Avatar, Button, Heading } from "../../components/ui";

const DetailedPrivateChatPage = ({ route }) => {
  const styles = useStyles();
  const { colors } = useTheme();
  const { otherParticipantId } = route.params;
  const [participantDetails, setParticipantDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  // const [profileImageUrl, setProfileImageUrl] = useState("https://via.placeholder.com/50");

  const { conversations, setConversations } = useContext(ChatContext);
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  console.log("Fetching details for user:", otherParticipantId);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("detailedPrivateChat"),
    });
  }, [language]);

  // 🔹 Fetch Other Participant Details
  useEffect(() => {
    const fetchParticipantDetails = async () => {
      try {
        const userData = await getUserById(otherParticipantId);
        console.log("Fetched User Data:", userData);
        // The avatar is handed to CachedImage as its stored object path, so it is
        // signed and downloaded once and served from disk on every later visit.
        setParticipantDetails(userData);
      } catch (error) {
        console.error("Error fetching participant details:", error);
        showAlert(i18n.t("error"), i18n.t("loadParticipantFailed"), [
          { text: i18n.t("ok") },
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchParticipantDetails();
  }, [otherParticipantId]);

  // 🔹 Whether I have this user blocked (drives the Block/Unblock button)
  useEffect(() => {
    const fetchBlockStatus = async () => {
      try {
        const status = await getBlockStatus(otherParticipantId);
        setBlockedByMe(!!status?.blockedByMe);
      } catch (error) {
        console.error("Error fetching block status:", error);
      }
    };
    fetchBlockStatus();
  }, [otherParticipantId]);

  const handleToggleBlock = async () => {
    if (blockBusy) return;

    if (blockedByMe) {
      // "Unblock user" path.
      const confirmed = await confirmAction({
        title: i18n.t("unblockUser"),
        message: i18n.t("confirmUnblockUser"),
        confirmText: i18n.t("unblockUser"),
        cancelText: i18n.t("cancel"),
      });
      if (!confirmed) return;

      setBlockBusy(true);
      try {
        await unblockUser(otherParticipantId);
        setBlockedByMe(false);
        showAlert(i18n.t("success"), i18n.t("userUnblocked"), [{ text: i18n.t("ok") }]);
      } catch (error) {
        showAlert(i18n.t("error"), i18n.t("unblockFailed"), [{ text: i18n.t("ok") }]);
      } finally {
        setBlockBusy(false);
      }
      return;
    }

    // Double-check before blocking; the message also explains how to unblock later.
    const confirmed = await confirmAction({
      title: i18n.t("blockUser"),
      message: i18n.t("confirmBlockUser"),
      confirmText: i18n.t("blockUser"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });
    if (!confirmed) return;

    setBlockBusy(true);
    try {
      await blockUser(otherParticipantId);
      setBlockedByMe(true);
      showAlert(i18n.t("success"), i18n.t("userBlocked"), [{ text: i18n.t("ok") }]);
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("blockFailed"), [{ text: i18n.t("ok") }]);
    } finally {
      setBlockBusy(false);
    }
  };

  const handleDeletePrivateConversation = async () => {
    const confirmed = await confirmAction({
      title: i18n.t("delete"),
      message: i18n.t("deletePrivateChatConfirm"),
      confirmText: i18n.t("delete"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });

    if (!confirmed) return;

    try {
      const conv = conversations.find(
        (c) =>
          c.conversationType === "private" &&
          c.participants.includes(otherParticipantId)
      );
      if (!conv) throw new Error(i18n.t("convoNotFound"));

      await deleteConversationFromDatabase(conv.conversationId);

      // setConversations((prev) =>
      //   prev.filter((c) => c.conversationId !== conv.conversationId)
      // );

      navigation.navigate("HomeTabs", { screen: "Chats" });
    } catch (err) {
      showAlert(i18n.t("error"), err.message || i18n.t("deleteChatFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <AppText variant="secondary">{i18n.t("loadingParticipantDetails")}</AppText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centeredContent}>
        <Avatar
          uri={participantDetails.profileImage}
          size="4xl"
          style={styles.profileImage}
        />
        <Heading level={1}>
          {formatName(participantDetails.firstName, participantDetails.lastName)}
        </Heading>
        {participantDetails.email && (
          <AppText variant="secondary" style={styles.email}>
            {participantDetails.email}
          </AppText>
        )}
        <Button
          variant="danger"
          size="sm"
          fullWidth={false}
          title={i18n.t("deleteConvo")}
          onPress={handleDeletePrivateConversation}
          style={styles.deleteButton}
        />

        <Button
          variant={blockedByMe ? "primary" : "danger"}
          size="sm"
          fullWidth={false}
          title={blockedByMe ? i18n.t("unblockUser") : i18n.t("blockUser")}
          onPress={handleToggleBlock}
          loading={blockBusy}
          style={styles.blockButton}
        />
      </View>
    </SafeAreaView>
  );
};

export default DetailedPrivateChatPage;

// Keeps Block and Unblock the same width, so the button doesn't jump as the label changes.
const BLOCK_BUTTON_MIN_WIDTH = 180;

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  centeredContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: t.spacing.lg,
  },
  profileImage: {
    marginBottom: t.spacing.lg,
    borderWidth: 2,
    borderColor: t.colors.primary,
  },
  email: {
    marginTop: t.spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButton: {
    marginTop: t.spacing["2xl"],
  },
  blockButton: {
    marginTop: t.spacing.base,
    minWidth: BLOCK_BUTTON_MIN_WIDTH,
  },
}));
