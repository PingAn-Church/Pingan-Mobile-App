import { showAlert } from "../../utils/showAlert";
import React, { useCallback, useEffect, useState, useContext } from "react";
import {
  SafeAreaView,
  Text,
  TextInput,
  View,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Switch,
  TouchableOpacity,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { ChatContext } from "../../context/ChatContext";
import { UserContext } from "../../context/UserContext";
import AddParticipantsModal from "../../components/Chat/AddParticipantsModal"; // ✅ Import the modal
import {
  removeParticipantFromGroup,
  setGroupAssistantEnabled,
  addAdminToGroup,
  removeAdminFromGroup,
  leaveGroup,
  updateGroupIcon,
  getGroupParticipants,
  renameAppGroup,
} from "../../service/ChatService";
import {
  getPresignedUploadUrl,
  uploadFileToOSS,
  deleteOwnUpload,
} from "../../service/OSSService";
import CachedImage from "../../components/CachedImage";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import defaultProfileImage from "../../../assets/user.png";
import { deleteConversationFromDatabase } from "../../service/ChatService";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { groupDisplayName } from "../../utils/conversationDisplay";
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
    setIsAdmin((found.adminIds || []).includes(user.id));

    // The app-level group's roster is the whole church, so the server leaves it
    // out of the conversation payload; it is paged in separately below.
    if (found.appLevel) return;

    const participantList = found.participants.map((id, index) => {
      // Keep name components so the row can be ordered per the display language;
      // participantProfiles is index-aligned with participants (same backend order).
      const profile = found.participantProfiles?.[index];
      return {
        id,
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        profileImage: profile?.profileImage || null,
        fallbackName: found.participantNames?.[index] || i18n.t("unknownUser"),
      };
    });
    setParticipants(participantList);
  }, [conversations, conversationId, user.id]);

  const isAppGroup = !!conversation?.appLevel;
  // Renaming the app-level group is an app-admin power, not a group-admin one:
  // its admin list mirrors the app admins anyway (see AppGroupChatService).
  const canRenameAppGroup = isAppGroup && !!user?.admin;

  const [memberPage, setMemberPage] = useState(0);
  const [hasMoreMembers, setHasMoreMembers] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const loadMembers = useCallback(
    async (page = 0) => {
      setLoadingMembers(true);
      try {
        const response = await getGroupParticipants(conversationId, { page, size: 30 });
        const rows = (Array.isArray(response?.data) ? response.data : []).map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          profileImage: p.profileImage || null,
          fallbackName: i18n.t("unknownUser"),
        }));
        setParticipants((previous) => (page === 0 ? rows : [...previous, ...rows]));
        setMemberPage(Number(response?.pagination?.page) || page);
        setHasMoreMembers(Boolean(response?.pagination?.hasMore));
      } catch (error) {
        console.error("Failed to load group members:", error);
      } finally {
        setLoadingMembers(false);
      }
    },
    [conversationId]
  );

  useEffect(() => {
    if (!isAppGroup) return;
    loadMembers(0);
  }, [isAppGroup, loadMembers]);

  const [nameEn, setNameEn] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!isAppGroup) return;
    setNameEn(conversation?.groupName || "");
    setNameZh(conversation?.groupNameZh || "");
  }, [isAppGroup, conversation?.groupName, conversation?.groupNameZh]);

  const handleRenameAppGroup = async () => {
    if (renaming) return;
    if (!nameEn.trim() || !nameZh.trim()) {
      // The server refuses a half-filled rename too: leaving one language blank
      // would show that half of the church a chat with no title.
      showAlert(i18n.t("error"), i18n.t("allFieldsRequired"), [{ text: i18n.t("ok") }]);
      return;
    }

    setRenaming(true);
    try {
      const updated = await renameAppGroup({ name: nameEn.trim(), nameZh: nameZh.trim() });
      // Patch only the names — the returned DTO carries no chat history, and
      // spreading it wholesale would blank the conversation in the list.
      setConversations((previous) =>
        previous.map((c) =>
          c.conversationId === updated.conversationId
            ? { ...c, groupName: updated.groupName, groupNameZh: updated.groupNameZh }
            : c
        )
      );
      showAlert(i18n.t("success"), i18n.t("appGroupRenamed"), [{ text: i18n.t("ok") }]);
    } catch (error) {
      console.error("Failed to rename the app group:", error);
      showAlert(i18n.t("error"), i18n.t("appGroupRenameFailed"), [{ text: i18n.t("ok") }]);
    } finally {
      setRenaming(false);
    }
  };

  // --- assistant switch (app-level group only) ------------------------------
  // Every other group turns the assistant on by adding it to the members and off
  // by removing it. This group's roster follows account verification and cannot be
  // hand-edited, so a switch is the only control it can have.
  const [assistantOn, setAssistantOn] = useState(false);
  const [togglingAssistant, setTogglingAssistant] = useState(false);

  useEffect(() => {
    setAssistantOn(!!conversation?.assistantEnabled);
  }, [conversation?.assistantEnabled]);

  const handleToggleAssistant = async (next) => {
    if (togglingAssistant) return;
    // Move the switch immediately, then put it back if the server disagrees —
    // waiting on a round trip makes the control feel broken.
    setAssistantOn(next);
    setTogglingAssistant(true);
    try {
      const updated = await setGroupAssistantEnabled(conversationId, next);
      setConversations((previous) =>
        previous.map((c) =>
          c.conversationId === updated.conversationId
            ? {
                ...c,
                assistantEnabled: updated.assistantEnabled,
                assistantId: updated.assistantId,
                assistantName: updated.assistantName,
                assistantNameZh: updated.assistantNameZh,
              }
            : c
        )
      );
    } catch (error) {
      console.error("Failed to switch the assistant:", error);
      setAssistantOn(!next);
      showAlert(i18n.t("error"), i18n.t("assistantSwitchFailed"), [{ text: i18n.t("ok") }]);
    } finally {
      setTogglingAssistant(false);
    }
  };

  // The icon's stored object path, not a signed URL — CachedImage does the signing
  // once and serves the downloaded copy afterwards. Held in state rather than read
  // straight off `conversation` so a freshly uploaded icon shows immediately,
  // without waiting for the subscription to deliver the updated conversation.
  const [uploadedIcon, setUploadedIcon] = useState(null);
  const chatIcon = uploadedIcon || conversation?.groupIcon || null;

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

        // Step 5: Show the new icon straight away. Redundant once the subscription
        // delivers the updated conversation, but that round trip is visible.
        setUploadedIcon(uploadedUrl);

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

      navigation.navigate("HomeTabs", { screen: "Chats" });

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

      navigation.navigate("HomeTabs", { screen: "Chats" });
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
    // The rename fields sit above the member list, so without this the keyboard
    // covers the very inputs it was opened for.
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      {/* Group Icon and Name */}
      <View style={styles.headerContainer}>
        <CachedImage
          uri={chatIcon}
          type="group"
          conversationId={conversationId}
          fallbackSource={defaultProfileImage}
          style={styles.chatIcon}
        />
        <Text style={styles.groupName}>{groupDisplayName(conversation, language)}</Text>
        {isAppGroup && (
          <Text style={styles.memberCount}>
            {i18n.t("memberCount", { count: conversation.participantCount || 0 })}
          </Text>
        )}

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

      {canRenameAppGroup && (
        <View style={styles.renameCard}>
          <Text style={styles.renameHeading}>{i18n.t("renameAppGroup")}</Text>
          <TextInput
            style={styles.renameInput}
            value={nameEn}
            onChangeText={setNameEn}
            placeholder={i18n.t("appGroupNameEn")}
          />
          <TextInput
            style={styles.renameInput}
            value={nameZh}
            onChangeText={setNameZh}
            placeholder={i18n.t("appGroupNameZh")}
          />
          <TouchableOpacity
            style={[styles.renameButton, renaming && styles.renameButtonDisabled]}
            onPress={handleRenameAppGroup}
            disabled={renaming}
          >
            <Text style={styles.renameButtonText}>
              {renaming ? i18n.t("saving") : i18n.t("save")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {canRenameAppGroup && (
        <View style={styles.renameCard}>
          <View style={styles.assistantSwitchRow}>
            <View style={styles.assistantSwitchText}>
              <Text style={styles.renameHeading}>{i18n.t("assistantSwitchTitle")}</Text>
              <Text style={styles.assistantSwitchHint}>{i18n.t("assistantSwitchHint")}</Text>
            </View>
            <Switch
              value={assistantOn}
              onValueChange={handleToggleAssistant}
              disabled={togglingAssistant}
            />
          </View>
        </View>
      )}

      {/* Everyone verified is in the app-level group and stays in it — leaving,
          deleting and hand-picking members are all meaningless there, and the
          backend refuses them anyway. Mute is the way to quieten it. */}
      {!isAppGroup && (
        <TouchableOpacity
          onPress={handleLeaveGroup}
          style={styles.leaveGroupButton}
        >
          <Text style={styles.leaveGroupText}>{i18n.t("leaveGroup")}</Text>
        </TouchableOpacity>
      )}

      {isAdmin && !isAppGroup && (
        <TouchableOpacity
          onPress={handleDeleteGroupConversation}
          style={styles.leaveGroupButton}
        >
          <Text style={styles.leaveGroupText}>{i18n.t("deleteGroup")}</Text>
        </TouchableOpacity>
      )}


      {/* Add Participants Button (Only visible to admins) */}
      {isAdmin && !isAppGroup && (
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
            <CachedImage
              uri={item.profileImage}
              type="profile"
              fallbackSource={defaultProfileImage}
              style={styles.profileImage}
            />
            <View style={styles.textContainer}>
              <Text style={styles.name}>
                {formatName(item.firstName, item.lastName) || item.fallbackName}
              </Text>
              <Text style={styles.bio}>{item.bio || i18n.t("noBio")}</Text>
            </View>

            {/* Make Admin Button */}
            {isAdmin && !isAppGroup && !conversation.adminIds.includes(item.id) && (
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
            {isAdmin && !isAppGroup && (
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
          loadingMembers ? null : (
            <Text style={styles.noParticipants}>
              {i18n.t("noParticipantsFound")}
            </Text>
          )
        }
        // Only the app-level group pages its members; every other group already
        // has its whole roster in hand.
        onEndReached={() => {
          if (isAppGroup && hasMoreMembers && !loadingMembers) loadMembers(memberPage + 1);
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMembers ? (
            <ActivityIndicator style={{ marginVertical: 14 }} color="#007aff" />
          ) : null
        }
      />

      {/* Add Participants Modal */}
      <AddParticipantsModal
        visible={showAddParticipantModal}
        onClose={() => setShowAddParticipantModal(false)}
        conversationId={conversationId}
        existingParticipants={participants}
        // Adding the assistant is how it is switched on, so it has to be offered
        // here. It is kept out of the user directory on purpose — otherwise it
        // would surface in "start a new chat" and the admin member lists too — so
        // the conversation carries its identity instead of the search finding it.
        assistant={
          conversation?.assistantId
            ? {
                id: conversation.assistantId,
                name: conversation.assistantName,
                nameZh: conversation.assistantNameZh,
              }
            : null
        }
      />
    </KeyboardAvoidingView>
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
  memberCount: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 10,
  },
  assistantSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  assistantSwitchText: {
    flex: 1,
  },
  assistantSwitchHint: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  renameCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    backgroundColor: "#f9fafb",
  },
  renameHeading: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  renameInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    fontSize: 15,
    marginBottom: 10,
  },
  renameButton: {
    backgroundColor: "#007aff",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  renameButtonDisabled: { opacity: 0.6 },
  renameButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
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
