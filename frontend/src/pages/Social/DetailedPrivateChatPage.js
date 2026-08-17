import { showAlert } from "../../utils/showAlert";
import React, { useEffect, useState, useContext } from "react";
import {
  SafeAreaView,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import { getUserById } from "../../service/UserService";
import CachedImage from "../../components/CachedImage";
import defaultProfileImage from "../../../assets/user.png";
import { deleteConversationFromDatabase } from "../../service/ChatService";
import { blockUser, unblockUser, getBlockStatus } from "../../service/BlockService";
import { useNavigation } from "@react-navigation/native";
import { ChatContext } from "../../context/ChatContext";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { LanguageContext } from "../../context/LanguageContext";

const DetailedPrivateChatPage = ({ route }) => {
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
      // Green "Unblock user" path.
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
        <ActivityIndicator size="large" color="#007aff" />
        <Text>{i18n.t("loadingParticipantDetails")}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centeredContent}>
        <CachedImage
          uri={participantDetails.profileImage}
          type="profile"
          fallbackSource={defaultProfileImage}
          style={styles.profileImage}
        />
        <Text style={styles.participantName}>
          {formatName(participantDetails.firstName, participantDetails.lastName)}
        </Text>
        {participantDetails.email && (
          <Text style={styles.email}>{participantDetails.email}</Text>
        )}
        <TouchableOpacity
          onPress={handleDeletePrivateConversation}
          style={{
            backgroundColor: "#FF3B30",
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 8,
            marginTop: 30,
          }}
        >
          <Text
            style={{ color: "#fff", fontWeight: "bold", textAlign: "center" }}
          >
            {i18n.t("deleteConvo")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleToggleBlock}
          disabled={blockBusy}
          style={[
            styles.blockButton,
            blockedByMe ? styles.unblockButton : styles.blockButtonRed,
            blockBusy && { opacity: 0.6 },
          ]}
        >
          {blockBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={{ color: "#fff", fontWeight: "bold", textAlign: "center" }}
            >
              {blockedByMe ? i18n.t("unblockUser") : i18n.t("blockUser")}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default DetailedPrivateChatPage;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centeredContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  profileImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#007aff",
  },
  participantName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
  },
  email: {
    fontSize: 16,
    color: "#666",
    marginTop: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  blockButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 14,
    minWidth: 180,
  },
  blockButtonRed: {
    backgroundColor: "#C62828",
  },
  unblockButton: {
    backgroundColor: "#2E7D32",
  },
});
