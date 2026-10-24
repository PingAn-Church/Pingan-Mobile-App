import { showAlert } from "../../utils/showAlert";
import React, { useCallback, useEffect, useState, useContext } from "react";
import {
  SafeAreaView,
  View,
  FlatList,
  ActivityIndicator,
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
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { deleteConversationFromDatabase } from "../../service/ChatService";
import { confirmAction } from "../../utils/confirmAction";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { groupDisplayName } from "../../utils/conversationDisplay";
import { LanguageContext } from "../../context/LanguageContext";
import { makeStyles, useTheme } from "../../theme";
import { AppText, Avatar, Button, Card, Heading, TextField } from "../../components/ui";

const DetailedGroupChatPage = ({ route }) => {
  const styles = useStyles();
  const { colors } = useTheme();
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
        <AppText variant="secondary">{i18n.t("convoNotFound")}</AppText>
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
        <ActivityIndicator size="large" color={colors.primary} />
        <AppText variant="secondary">{i18n.t("loadingParticipants")}</AppText>
      </SafeAreaView>
    );
  }

  return (
    // The rename fields sit above the member list, so without this the keyboard
    // covers the very inputs it was opened for.
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      {/* Group Icon and Name */}
      <View style={styles.headerContainer}>
        <Avatar
          uri={chatIcon}
          type="group"
          conversationId={conversationId}
          size="2xl"
          style={styles.chatIcon}
        />
        <Heading level={1} style={styles.groupName}>
          {groupDisplayName(conversation, language)}
        </Heading>
        {isAppGroup && (
          <AppText variant="secondary" style={styles.memberCount}>
            {i18n.t("memberCount", { count: conversation.participantCount || 0 })}
          </AppText>
        )}

        {/* Backend updateGroupIcon is admin-only; only admins get the control so
            non-admins never hit the guaranteed "only admins" 400 (shown as a generic
            failure). Matches every other mutating action on this screen. */}
        {isAdmin && (
          <Button
            size="md"
            fullWidth={false}
            title={i18n.t("changeImage")}
            onPress={handleChangeGroupIcon}
            style={styles.changeIconButton}
          />
        )}
      </View>

      {canRenameAppGroup && (
        <Card style={styles.renameCard}>
          <AppText
            variant="cardTitleSmall"
            accessibilityRole="header"
            style={styles.renameHeading}
          >
            {i18n.t("renameAppGroup")}
          </AppText>
          <TextField
            style={styles.renameInput}
            value={nameEn}
            onChangeText={setNameEn}
            placeholder={i18n.t("appGroupNameEn")}
          />
          <TextField
            style={styles.renameInput}
            value={nameZh}
            onChangeText={setNameZh}
            placeholder={i18n.t("appGroupNameZh")}
          />
          <Button
            size="md"
            title={renaming ? i18n.t("saving") : i18n.t("save")}
            onPress={handleRenameAppGroup}
            disabled={renaming}
          />
        </Card>
      )}

      {canRenameAppGroup && (
        <Card style={styles.renameCard}>
          <View style={styles.assistantSwitchRow}>
            <View style={styles.assistantSwitchText}>
              <AppText
                variant="cardTitleSmall"
                accessibilityRole="header"
                style={styles.renameHeading}
              >
                {i18n.t("assistantSwitchTitle")}
              </AppText>
              <AppText variant="secondary" style={styles.assistantSwitchHint}>
                {i18n.t("assistantSwitchHint")}
              </AppText>
            </View>
            <Switch
              value={assistantOn}
              onValueChange={handleToggleAssistant}
              disabled={togglingAssistant}
              accessibilityLabel={i18n.t("assistantSwitchTitle")}
              accessibilityHint={i18n.t("assistantSwitchHint")}
            />
          </View>
        </Card>
      )}

      {/* Everyone verified is in the app-level group and stays in it — leaving,
          deleting and hand-picking members are all meaningless there, and the
          backend refuses them anyway. Mute is the way to quieten it. */}
      {!isAppGroup && (
        <Button
          variant="danger"
          size="md"
          title={i18n.t("leaveGroup")}
          onPress={handleLeaveGroup}
          style={styles.leaveGroupButton}
        />
      )}

      {isAdmin && !isAppGroup && (
        <Button
          variant="danger"
          size="md"
          title={i18n.t("deleteGroup")}
          onPress={handleDeleteGroupConversation}
          style={styles.leaveGroupButton}
        />
      )}


      {/* Add Participants Button (Only visible to admins) */}
      {isAdmin && !isAppGroup && (
        <TouchableOpacity
          style={styles.addParticipantButton}
          onPress={() => setShowAddParticipantModal(true)}
          accessibilityRole="button"
        >
          <AppText variant="link" size="lg">
            {i18n.t("addParticipants")}
          </AppText>
        </TouchableOpacity>
      )}

      {/* Participant List */}
      <FlatList
        data={participants}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.participantCard}>
            <Avatar uri={item.profileImage} size="lg" style={styles.profileImage} />
            <View style={styles.textContainer}>
              <AppText variant="body" color="textPrimary" weight="semibold">
                {formatName(item.firstName, item.lastName) || item.fallbackName}
              </AppText>
              <AppText variant="secondary">{item.bio || i18n.t("noBio")}</AppText>
            </View>

            {/* Make Admin Button */}
            {isAdmin && !isAppGroup && !conversation.adminIds.includes(item.id) && (
              <Button
                size="sm"
                fullWidth={false}
                title={`+ ${i18n.t("admin")}`}
                onPress={() => handleAddAdmin(item.id)}
                style={[styles.smallButton, styles.addAdminButton]}
              />
            )}

            {/* Admin Badge */}
            {conversation.adminIds.includes(item.id) && (
              <View style={styles.adminBadgeContainer}>
                <AppText
                  variant="badge"
                  color="primary"
                  size="sm"
                  style={styles.adminBadge}
                >
                  {i18n.t("admin")}
                </AppText>
              </View>
            )}

            {/* Remove Admin and Remove Participant Buttons */}
            {isAdmin && !isAppGroup && (
              <View style={styles.removeButtonsContainer}>
                {/* Remove Admin Button */}
                {conversation.adminIds.includes(item.id) &&
                  item.id !== user.id && (
                    <Button
                      variant="danger"
                      size="sm"
                      fullWidth={false}
                      title={`x ${i18n.t("admin")}`}
                      onPress={() => handleRemoveAdmin(item.id)}
                      style={[styles.smallButton, styles.removeAdminButton]}
                    />
                  )}

                {/* Remove Participant Button */}
                <Button
                  variant="danger"
                  size="sm"
                  fullWidth={false}
                  title={`x ${i18n.t("participant")}`}
                  onPress={() => handleRemoveParticipant(item.id)}
                  style={styles.smallButton}
                />
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={
          loadingMembers ? null : (
            <AppText variant="secondary" style={styles.noParticipants}>
              {i18n.t("noParticipantsFound")}
            </AppText>
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
            <ActivityIndicator style={styles.loadingMore} color={colors.primary} />
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

export default DetailedGroupChatPage;

const useStyles = makeStyles((t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
    padding: t.spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: t.colors.background,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: t.spacing.lg,
  },
  chatIcon: {
    marginBottom: t.spacing.md,
  },
  groupName: {
    textAlign: "center",
    marginBottom: t.spacing.md,
  },
  memberCount: {
    marginBottom: t.spacing.md,
  },
  changeIconButton: {
    marginTop: t.spacing.md,
    minHeight: 0,
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.base,
  },
  renameCard: {
    marginBottom: t.spacing.base,
  },
  renameHeading: {
    marginBottom: t.spacing.md,
  },
  renameInput: {
    paddingHorizontal: t.spacing.md,
    backgroundColor: t.colors.surface,
    marginBottom: t.spacing.md,
  },
  assistantSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: t.spacing.md, 
  },
  assistantSwitchText: {
    flex: 1,
  },
  assistantSwitchHint: {
    marginTop: t.spacing.xs,
  },
  leaveGroupButton: {
    marginTop: t.spacing.base,
    marginHorizontal: t.spacing.lg,
  },
  addParticipantButton: {
    paddingVertical: t.spacing.base,
    paddingHorizontal: t.spacing.lg,
  },
  participantCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: t.spacing.base,
    paddingHorizontal: t.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  profileImage: {
    marginRight: t.spacing.base,
  },
  textContainer: {
    flex: 1,
  },
  // The admin buttons and their gaps use sm, not the md that 10 snaps to: the row
  // is crowded, and every point here comes out of the name column.
  smallButton: {
    minHeight: 0,
    paddingVertical: t.spacing.xs,
    paddingHorizontal: t.spacing.sm,
  },
  addAdminButton: {
    marginLeft: t.spacing.sm,
  },
  removeAdminButton: {
    marginBottom: t.spacing.md,
  },
  removeButtonsContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    marginLeft: t.spacing.sm,
  },
  adminBadgeContainer: {
    justifyContent: "center",
    alignItems: "flex-end",
    flex: 1,
  },
  adminBadge: {
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
    backgroundColor: t.colors.surfaceTinted,
    borderRadius: t.radius.full,
    overflow: "hidden",
  },
  noParticipants: {
    textAlign: "center",
    marginTop: t.spacing.lg,
  },
  loadingMore: {
    marginVertical: t.spacing.base,
  },
}));
