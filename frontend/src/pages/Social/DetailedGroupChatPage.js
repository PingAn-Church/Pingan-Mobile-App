import { showAlert } from "../../utils/showAlert";
import React, { useEffect, useState, useContext } from "react";
import {
  SafeAreaView,
  Text,
  View,
  Image,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import { ChatContext } from "../../context/ChatContext";
import { UserContext } from "../../context/UserContext";
import AddParticipantsModal from "../../components/Chat/AddParticipantsModal"; // ✅ Import the modal
import {
  removeParticipantFromGroup,
  addAdminToGroup,
  removeAdminFromGroup,
  leaveGroup,
  updateGroupIcon,
} from "../../service/ChatService";
import {
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
  uploadFileToOSS,
  deleteOwnUpload,
} from "../../service/OSSService";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import defaultProfileImage from "../../../assets/user.png";
import { deleteConversationFromDatabase } from "../../service/ChatService";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { LanguageContext } from "../../context/LanguageContext";

const DetailedGroupChatPage = ({ route }) => {
  const { conversationId } = route.params; // We're still using conversationId passed via route
  const { conversations, setConversations } = useContext(ChatContext); // Access conversations from ChatContext
  const { language } = useContext(LanguageContext);
  const { user } = useContext(UserContext); // Get current logged-in user
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [participants, setParticipants] = useState([]);
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("detailedGroupChat"),
    });
  }, [language]);

  useEffect(() => {
    const found = conversations.find(
      (c) => c.conversationId === conversationId
    );
    if (!found) return;

    setConversation(found);
    setIsAdmin(found.adminIds.includes(user.id));
    const participantList = found.participants.map((id, index) => {
      // Keep name components so the row can be ordered per the display language;
      // participantProfiles is index-aligned with participants (same backend order).
      const profile = found.participantProfiles?.[index];
      return {
        id,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        fallbackName: found.participantNames?.[index] || i18n.t("unknownUser"),
      };
    });
    setParticipants(participantList);
  }, [conversations, conversationId, user.id]);

  // Find the current conversation from the conversations context
  // const conversation = conversations.find((conv) => conv.conversationId === conversationId);

  // const isAdmin = conversation?.adminIds.includes(user.id); // Check if the current user is an admin

  const fetchViewingPresignedUrl = async (imageUrl, type) => {
    try {
      // if (!imageUrl) return "https://via.placeholder.com/50"; // Fallback for missing images
      if (!imageUrl) return null;
      const fileName = imageUrl.split("/").pop();
      return await getPresignedDownloadUrl(fileName, type, { conversationId });
    } catch (error) {
      console.error(`Error getting presigned URL for ${type}:`, error);
      // return "https://via.placeholder.com/50";
      return null;
    }
  };

  const [chatIconUrl, setChatIconUrl] = useState(null);

  useEffect(() => {
    const fetchChatIcon = async () => {
      if (conversation?.groupIcon) {
        const iconUrl = await fetchViewingPresignedUrl(
          conversation.groupIcon,
          "group"
        );
        setChatIconUrl(iconUrl);
      }
    };
    fetchChatIcon();
  }, [conversation]); // This effect runs whenever the conversation data changes

  const handleChangeGroupIcon = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      let uploadedUrl = null;
      try {
        const fileUri = result.assets[0].uri;
        const fileName = `group_${conversationId}_${Date.now()}.jpg`;

        // Step 1: Get upload URL
        const presignedUrl = await getPresignedUploadUrl(fileName, "group");

        // Step 2: Upload to OSS
        uploadedUrl = await uploadFileToOSS(fileUri, presignedUrl);

        // Step 3: Update group icon in backend
        const updatedConversation = await updateGroupIcon(
          conversationId,
          uploadedUrl
        );

        // Step 4: Update context
        // setConversations((prev) =>
        //   prev.map((conv) =>
        //     conv.conversationId === conversationId ? updatedConversation : conv
        //   )
        // );

        // Step 5: Update local image URL for immediate UI update. Redundant due to subscription, but helps for speed for existing uyser.
        const viewingUrl = await fetchViewingPresignedUrl(uploadedUrl, "group");
        setChatIconUrl(viewingUrl);

        showAlert(i18n.t("success"), i18n.t("updateGroupIconSuccess"), [
          { text: i18n.t("ok") },
        ]);
      } catch (error) {
        if (uploadedUrl) {
          try {
            await deleteOwnUpload(uploadedUrl, "group");
          } catch (cleanupError) {
            if (cleanupError?.response?.status !== 409) {
              console.warn("Failed to clean up unreferenced group icon:", cleanupError);
            }
          }
        }
        console.error("❌ Failed to change group icon:", error);
        showAlert(i18n.t("error"), i18n.t("updateGroupIconFailed"), [
          { text: i18n.t("ok") },
        ]);
      }
    }
  };

  const handleRemoveParticipant = async (userId) => {
    try {
      await removeParticipantFromGroup(conversationId, userId);
      // setConversations((prev) =>
      //   prev.map((conv) =>
      //     conv.conversationId === conversationId
      //       ? {
      //           ...conv,
      //           participants: conv.participants.filter((id) => id !== userId),
      //         }
      //       : conv
      //   )
      // );
      showAlert(i18n.t("success"), i18n.t("removeUserSuccess"), [
        { text: i18n.t("ok") },
      ]);
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("removeUserFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  const handleAddAdmin = async (userId) => {
    try {
      await addAdminToGroup(conversationId, userId);
      // const response = await addAdminToGroup(conversationId, userId);

      // Update the conversation's admin list in context
      // setConversations((prevConversations) =>
      //   prevConversations.map((conv) =>
      //     conv.conversationId === conversationId
      //       ? { ...conv, adminIds: response.adminIds, adminNames: response.adminNames }
      //       : conv
      //   )
      // );

      showAlert(i18n.t("success"), i18n.t("addChatAdminSuccess"), [
        { text: i18n.t("ok") },
      ]);
    } catch (error) {
      console.error("❌ Error adding admin:", error);
      showAlert(i18n.t("error"), i18n.t("addChatAdminFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  const handleRemoveAdmin = async (userId) => {
    try {
      if (conversation.adminIds.length === 1) {
        showAlert(i18n.t("error"), i18n.t("cannotRemoveLastAdmin"), [
          { text: i18n.t("ok") },
        ]);
        return;
      }

      await removeAdminFromGroup(conversationId, userId);

      setConversations((prevConversations) =>
        prevConversations.map((conv) =>
          conv.conversationId === conversationId
            ? { ...conv, adminIds: conv.adminIds.filter((id) => id !== userId) }
            : conv
        )
      );
      showAlert(i18n.t("success"), i18n.t("removeChatAdminSuccess"), [
        { text: i18n.t("ok") },
      ]);
    } catch (error) {
      console.error("❌ Error removing admin:", error);
      showAlert(i18n.t("error"), i18n.t("removeChatAdminFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  // **Leave Group**
  const handleLeaveGroup = async () => {
    try {
      await leaveGroup(conversationId);
      showAlert(i18n.t("success"), i18n.t("leftGroupSuccess"), [
        { text: i18n.t("ok") },
      ]);

      // Remove the conversation from the chat list and update UI
      setConversations((prevConversations) =>
        prevConversations.filter(
          (conv) => conv.conversationId !== conversationId
        )
      );

      navigation.navigate("ChatHome");

      // Optionally, you can navigate the user to another page, like the home page or chat list
    } catch (error) {
      console.log("ERROR", error);
      // const errorMessage = error?.response?.data || "Failed to leave the group.";
      const errorMessage =
        error?.response?.data?.message || i18n.t("leftGroupFailed");

      if (errorMessage.includes("only admin")) {
        showAlert(i18n.t("onlyAdminLeft"), i18n.t("assignAnotherAdmin"), [
          { text: i18n.t("ok") },
        ]);
      } else {
        showAlert(i18n.t("error"), errorMessage, [{ text: i18n.t("ok") }]);
      }
    }

    // catch (error) {
    //   console.error("Error leaving group:", error);
    //   showAlert("Error", "Failed to leave the group.");
    // }
  };

  const handleDeleteGroupConversation = async () => {
    const confirmed = await confirmAction({
      title: i18n.t("delete"),
      message: i18n.t("deleteGroupChatConfirm"),
      confirmText: i18n.t("delete"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });

    if (!confirmed) return;

    try {
      await deleteConversationFromDatabase(conversationId);

      // setConversations((prev) =>
      //   prev.filter((c) => c.conversationId !== conversationId)
      // );

      navigation.navigate("ChatHome");
    } catch (err) {
      showAlert(i18n.t("error"), err.message || i18n.t("deleteChatFailed"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  if (!conversation) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text>{i18n.t("convoNotFound")}</Text>
      </SafeAreaView>
    );
  }

  // const participants = conversation.participants.map((id, index) => ({
  //   id,
  //   fullName: conversation.participantNames[index] || "Unknown",
  // }));

  if (conversation.loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007aff" />
        <Text>{i18n.t("loadingParticipants")}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Group Icon and Name */}
      <View style={styles.headerContainer}>
        {/* <Image source={{ uri: chatIconUrl }} style={styles.chatIcon} /> */}
        <Image
          source={chatIconUrl ? { uri: chatIconUrl } : defaultProfileImage}
          style={styles.chatIcon}
        />
        <Text style={styles.groupName}>{conversation.groupName}</Text>

        {/* Backend updateGroupIcon is admin-only; only admins get the control so
            non-admins never hit the guaranteed "only admins" 400 (shown as a generic
            failure). Matches every other mutating action on this screen. */}
        {isAdmin && (
          <TouchableOpacity
            onPress={handleChangeGroupIcon}
            style={styles.changeIconButton}
          >
            <Text style={styles.changeIconText}>{i18n.t("changeImage")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Leave Group Button */}
      <TouchableOpacity
        onPress={handleLeaveGroup}
        style={styles.leaveGroupButton}
      >
        <Text style={styles.leaveGroupText}>{i18n.t("leaveGroup")}</Text>
      </TouchableOpacity>

      {isAdmin && (
        <TouchableOpacity
          onPress={handleDeleteGroupConversation}
          style={styles.leaveGroupButton}
        >
          <Text style={styles.leaveGroupText}>{i18n.t("deleteGroup")}</Text>
        </TouchableOpacity>
      )}


      {/* Add Participants Button (Only visible to admins) */}
      {isAdmin && (
        <TouchableOpacity
          style={styles.addParticipantButton}
          onPress={() => setShowAddParticipantModal(true)}
        >
          <Text style={styles.addParticipantText}>
            {i18n.t("addParticipants")}
          </Text>
        </TouchableOpacity>
      )}

      {/* Participant List */}
      <FlatList
        data={participants}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.participantCard}>
            <Image
              source={
                item.profileImageUrl
                  ? { uri: item.profileImageUrl }
                  : defaultProfileImage
              }
              style={styles.profileImage}
            />
            <View style={styles.textContainer}>
              <Text style={styles.name}>
                {formatName(item.firstName, item.lastName) || item.fallbackName}
              </Text>
              <Text style={styles.bio}>{item.bio || i18n.t("noBio")}</Text>
            </View>

            {/* Make Admin Button */}
            {isAdmin && !conversation.adminIds.includes(item.id) && (
              <TouchableOpacity
                onPress={() => handleAddAdmin(item.id)}
                style={styles.addAdminButton}
              >
                <Text style={styles.addAdminText}>+ {i18n.t("admin")}</Text>
              </TouchableOpacity>
            )}

            {/* Admin Badge */}
            {conversation.adminIds.includes(item.id) && (
              <View style={styles.adminBadgeContainer}>
                <Text style={styles.adminBadge}>{i18n.t("admin")}</Text>
              </View>
            )}

            {/* Remove Admin and Remove Participant Buttons */}
            {isAdmin && (
              <View style={styles.removeButtonsContainer}>
                {/* Remove Admin Button */}
                {conversation.adminIds.includes(item.id) &&
                  item.id !== user.id && (
                    <TouchableOpacity
                      onPress={() => handleRemoveAdmin(item.id)}
                      style={styles.removeAdminButton}
                    >
                      <Text style={styles.removeAdminText}>
                        x {i18n.t("admin")}
                      </Text>
                    </TouchableOpacity>
                  )}

                {/* Remove Participant Button */}
                <TouchableOpacity
                  onPress={() => handleRemoveParticipant(item.id)}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeButtonText}>
                    x {i18n.t("participant")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.noParticipants}>
            {i18n.t("noParticipantsFound")}
          </Text>
        }
      />

      {/* Add Participants Modal */}
      <AddParticipantsModal
        visible={showAddParticipantModal}
        onClose={() => setShowAddParticipantModal(false)}
        conversationId={conversationId}
        existingParticipants={participants}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerContainer: { alignItems: "center", marginBottom: 20 },
  chatIcon: { width: 100, height: 100, borderRadius: 50, marginBottom: 10 },
  groupName: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  participantCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  profileImage: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  textContainer: { flex: 1 },
  name: { fontSize: 18, fontWeight: "600" },
  bio: { fontSize: 14, color: "#555" },
  noParticipants: {
    textAlign: "center",
    fontSize: 16,
    color: "#888",
    marginTop: 20,
  },
  adminBadgeContainer: {
    justifyContent: "center",
    alignItems: "flex-end",
    flex: 1,
  },
  adminBadge: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#007aff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#EAF3FF",
    borderRadius: 10,
    overflow: "hidden",
  },
  removeButton: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  removeButtonText: { color: "#fff", fontWeight: "bold" },
  addAdminButton: {
    backgroundColor: "#007aff",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginLeft: 10,
  },
  addAdminText: { color: "#fff", fontWeight: "bold" },
  addParticipantButton: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomColor: "#ddd",
  },
  addParticipantText: { fontSize: 18, fontWeight: "600", color: "#007aff" },
  removeAdminButton: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    marginBottom: 10,
  },
  removeAdminText: { color: "#fff", fontWeight: "bold" },
  removeButtonsContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginLeft: 10,
  },
  leaveGroupButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 15,
    marginHorizontal: 20,
  },
  leaveGroupText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  changeIconButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: "#007aff",
    borderRadius: 6,
  },

  changeIconText: {
    color: "#fff",
    fontWeight: "bold",
    textAlign: "center",
    fontSize: 16,
  },
});

export default DetailedGroupChatPage;
