import { showAlert } from "../../utils/showAlert";
import React, {
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import {
  SafeAreaView,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Alert,
  StatusBar,
  TouchableOpacity,
  Image,
  Button,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { UserContext } from "../../context/UserContext";
import {
  getUserById,
  startPrivateChat,
  startGroupChat,
} from "../../service/UserService";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ChatContext } from "../../context/ChatContext";
import * as ImagePicker from "expo-image-picker";
import {
  getPresignedUploadUrl,
  uploadFileToOSS,
} from "../../service/OSSService";
import { getStompClient } from "../../service/WebSocketService";
import defaultProfileImage from "../../../assets/user.png";
import CachedImage from "../../components/CachedImage";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import { messagePreview } from "../../utils/messageKinds";
import {
  compareConversations,
  groupDisplayName,
} from "../../utils/conversationDisplay";
import { LanguageContext } from "../../context/LanguageContext";
import { confirmAction } from "../../utils/confirmAction";
import {
  deleteConversationFromDatabase,
  setConversationMuteStatus,
  setConversationPinStatus,
} from "../../service/ChatService";
import SwipeableRow from "../../components/Chat/SwipeableRow";
import ConversationActionSheet from "../../components/Chat/ConversationActionSheet";

const ChatHomePage = () => {
  const { user, loading, userStatus } = useContext(UserContext);
  const {
    conversations,
    loading: loadingConversations,
    updateConversation,
    setConversations,
    fetchInitialData,
    topicUnread,
    refreshTopicUnread,
    drafts,
    setConversationMuted,
    setConversationPinned,
  } = useContext(ChatContext);

  const [selectedUser, setSelectedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  // const [filteredConversations, setFilteredConversations] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  // The long-press sheet for one row: its title and the actions it offers.
  const [rowSheet, setRowSheet] = useState({ visible: false, title: "", actions: [] });

  const showInitialLoader =
    (loading || loadingConversations || !user) && !refreshing;
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();

  // console.log("conversations123", conversations)

  // Sort conversations by the latest message in chatHistory
  // const sortedConversations = useMemo(() => {
  //   // Sort conversations based on the latest message timestamp
  //   return conversations.sort((a, b) => {
  //     const lastMessageA = a.chatHistory[a.chatHistory.length - 1];
  //     const lastMessageB = b.chatHistory[b.chatHistory.length - 1];

  //     // If there's no last message, treat as if it's older
  //     const timeA = lastMessageA ? new Date(lastMessageA.timestamp).getTime() : 0;
  //     const timeB = lastMessageB ? new Date(lastMessageB.timestamp).getTime() : 0;

  //     return timeB - timeA;  // Sort in descending order (latest first)
  //   });
  // }, [conversations]); // Re-run sorting when `conversations` changes

  // const sortedConversations = useMemo(() => {
  //   return [...conversations].sort((a, b) => {
  //     const lastMessageA = a.chatHistory?.[a.chatHistory.length - 1];
  //     const lastMessageB = b.chatHistory?.[b.chatHistory.length - 1];

  //     const timestampA = lastMessageA
  //       ? new Date(lastMessageA.timestamp).getTime()
  //       : new Date(a.createdAt).getTime();

  //     const timestampB = lastMessageB
  //       ? new Date(lastMessageB.timestamp).getTime()
  //       : new Date(b.createdAt).getTime();

  //     return timestampB - timestampA;
  //   });
  // }, [conversations]);

  // const sortedConversations = useMemo(() => {
  //   return [...conversations].sort((a, b) => {
  //     const lastMessageA = a.chatHistory?.[a.chatHistory.length - 1];
  //     const lastMessageB = b.chatHistory?.[b.chatHistory.length - 1];

  //     const timestampA = lastMessageA
  //       ? new Date(lastMessageA.timestamp).getTime()
  //       : a.updatedAt || a.createdAt || 0;

  //     const timestampB = lastMessageB
  //       ? new Date(lastMessageB.timestamp).getTime()
  //       : b.updatedAt || b.createdAt || 0;

  //     return timestampB - timestampA;
  //   });
  // }, [conversations]);

  const sortedConversations = useMemo(
    () => [...conversations].sort(compareConversations),
    [conversations]
  );

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return sortedConversations;

    const lowercasedQuery = searchQuery.toLowerCase();

    return sortedConversations.filter((conversation) => {
      // Group: match the name as it is actually displayed, so searching for the
      // app-level group in Chinese finds it when the app is in Chinese.
      if (conversation.conversationType === "group") {
        return groupDisplayName(conversation, language)
          .toLowerCase()
          .includes(lowercasedQuery);
      }

      // Private: check participant names
      if (conversation.conversationType === "private") {
        return (conversation.participantNames || []).some((name) =>
          name.toLowerCase().includes(lowercasedQuery)
        );
      }

      return false;
    });
  }, [sortedConversations, searchQuery, language]);

  /**
   * The chat list holds one row that is not a conversation at all: the way into
   * threads. It has no history and no unread count of its own, so it carries a
   * marker the row renderer switches on rather than pretending to be a chat.
   *
   * It sits directly under the app-level group, above every ordinary
   * conversation — both are permanent, so a member who was verified a minute ago
   * still finds them waiting at the top of an otherwise empty list.
   */
  const listData = useMemo(() => {
    const rows = [...filteredConversations];

    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query || i18n.t("topicsThreadsOverview").toLowerCase().includes(query);
    if (!matchesSearch) return rows;

    const appGroupIndex = rows.findIndex((c) => c.appLevel);
    rows.splice(appGroupIndex + 1, 0, {
      conversationId: "__topics__",
      isTopicsRow: true,
    });
    return rows;
  }, [filteredConversations, searchQuery, language]);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("Chats"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useEffect(() => {
    handleSearch(searchQuery); // Reapply search filter to updated conversations
  }, [conversations]);

  // On focus rather than on mount: coming back from reading a topic should drop
  // the badge straight away, not on the next cold load of this screen.
  useFocusEffect(
    useCallback(() => {
      refreshTopicUnread();
    }, [refreshTopicUnread])
  );

  // Conversation icons now resolve + cache per-row via <CachedImage> (keyed by the
  // object path), instead of re-signing a presigned URL for every conversation on each
  // `conversations` change — that churn re-downloaded avatars constantly and bloated
  // the OS image cache.

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await fetchInitialData(); // Re-fetch conversations
    } catch (err) {
      console.error("Failed to refresh chats", err);
      showAlert(i18n.t("error"), i18n.t("cantLoadChat"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleSearch = (query) => {
    setSearchQuery(query);
  };

  const getLastMessage = (conversation) => {
    // The preview comes from the server-computed lastMessage (history is loaded
    // lazily and usually absent here); loaded history is only a fallback for
    // payloads that predate the field.
    const source =
      conversation.lastMessage ||
      conversation.chatHistory?.[conversation.chatHistory.length - 1];

    if (!source) return null;

    if (!user) {
      console.warn("⚠️ User is null, skipping last message processing.");
      return null; // Prevents crash when user logs out
    }

    // Derive display fields onto a copy — the source object lives in context
    // state and must not be mutated during render.
    const lastMessage = { ...source };

    // Only a group preview names its sender: a private chat has exactly one
    // other person, and the row title already says who that is. Names follow
    // the same rules as the bubbles in ChatPage — formatName orders them for
    // the reader's language, and the assistant is called by its Chinese name
    // to Chinese readers.
    if (conversation.conversationType === "group") {
      if (String(lastMessage.senderId) === String(user.id)) {
        lastMessage.senderFullName = i18n.t("chatPreviewYou");
      } else if (lastMessage.senderBot) {
        lastMessage.senderFullName =
          (String(language || "").startsWith("zh") && lastMessage.senderDisplayNameZh) ||
          lastMessage.senderFirstName ||
          i18n.t("unknownUser");
      } else {
        lastMessage.senderFullName =
          formatName(lastMessage.senderFirstName, lastMessage.senderLastName, language) ||
          i18n.t("unknownUser");
      }
    }

    // Non-text kinds preview as a label ("🖼️ Photo"), text as itself — see
    // utils/messageKinds, which every screen showing a message consults.
    lastMessage.previewContent = messagePreview(lastMessage);

    const deliveryStatuses = Object.values(lastMessage.deliveryStatus || {});

    // Determine delivery icon based on minimum status. Group messages carry no
    // receipts — read state there is a watermark, not a row per recipient — so
    // there is nothing to tick and the row shows none.
    let deliveryIcon = deliveryStatuses.length ? "✔" : "";
    if (deliveryStatuses.includes("SENT")) {
      deliveryIcon = "✔";
    } else if (deliveryStatuses.includes("DELIVERED")) {
      deliveryIcon = "✔✔";
    } else if (deliveryStatuses.includes("READ")) {
      deliveryIcon = "👀";
    }

    lastMessage.deliveryStatusIcon = deliveryIcon;

    return lastMessage;
  };

  const handleChat = (conversation) => {
    navigation.navigate("Chat", {
      conversationId: conversation.conversationId,
      // participants: conversation.participants.map((id, index) => ({
      //   id,
      //   fullName: conversation.participantNames[index] || "Unknown",
      // })),
      // groupName: getChatName(conversation),
      // conversationType: conversation.conversationType,
      // chatIcon: getChatIcon(conversation),
      // admins: conversation.adminIds || [],
    });
  };

  const getUnreadMessageCount = (conversation) => {
    // Server-computed badge; the client no longer loads every message to count.
    return conversation.unreadCount || 0;
  };

  const getOnlineUserCount = (conversation) => {
    // Empty for the app-level group, whose roster the server deliberately does
    // not send — an online count of the whole church is not worth the payload.
    return (conversation.participants || []).reduce((count, participantId) => {
      return userStatus[String(participantId)] === "online" ? count + 1 : count;
    }, 0);
  };

  // --- row actions: pin, mute, delete -------------------------------------------
  // Offered by a long-press on the row everywhere and, on a phone, by the buttons
  // behind a swipe. Pin and mute flip at once and are put back if the server says
  // no; delete asks first. The app-level group cannot be pinned (it is always on
  // top) and only a private chat can be deleted from here.
  const togglePinned = useCallback(
    async (conversation) => {
      const next = !conversation.pinned;
      setConversationPinned(conversation.conversationId, next);
      try {
        await setConversationPinStatus(conversation.conversationId, conversation.conversationType, next);
      } catch (error) {
        setConversationPinned(conversation.conversationId, !next);
        showAlert(i18n.t("error"), i18n.t("pinUpdateFailed"));
      }
    },
    [setConversationPinned]
  );

  const toggleMuted = useCallback(
    async (conversation) => {
      const next = !conversation.muted;
      setConversationMuted(conversation.conversationId, next);
      try {
        await setConversationMuteStatus(conversation.conversationId, conversation.conversationType, next);
      } catch (error) {
        setConversationMuted(conversation.conversationId, !next);
        showAlert(i18n.t("error"), i18n.t("muteUpdateFailed"));
      }
    },
    [setConversationMuted]
  );

  const deleteConversation = useCallback(
    async (conversation) => {
      const confirmed = await confirmAction({
        title: i18n.t("deleteConvo"),
        message: i18n.t("deletePrivateChatConfirm"),
        confirmText: i18n.t("delete"),
        cancelText: i18n.t("cancel"),
        destructive: true,
      });
      if (!confirmed) return;
      try {
        await deleteConversationFromDatabase(conversation.conversationId);
        // The server says so over the socket too; dropping the row now spares the wait.
        setConversations((prev) =>
          prev.filter((c) => String(c.conversationId) !== String(conversation.conversationId))
        );
      } catch (error) {
        showAlert(i18n.t("error"), error?.message || i18n.t("deleteChatFailed"));
      }
    },
    [setConversations]
  );

  const rowActionsFor = useCallback(
    (conversation) => {
      if (!conversation || conversation.isTopicsRow) return [];
      const actions = [];
      if (!conversation.appLevel) {
        actions.push({
          key: "pin",
          icon: conversation.pinned ? "pin-outline" : "pin",
          color: "#f97316",
          label: i18n.t(conversation.pinned ? "unpinFromTop" : "pinToTop"),
          onPress: () => togglePinned(conversation),
        });
      }
      actions.push({
        key: "mute",
        icon: conversation.muted ? "notifications-outline" : "notifications-off-outline",
        color: "#6b7280",
        label: i18n.t(conversation.muted ? "unmuteShort" : "muteShort"),
        onPress: () => toggleMuted(conversation),
      });
      if (conversation.conversationType === "private") {
        actions.push({
          key: "delete",
          icon: "trash-outline",
          color: "#ef4444",
          destructive: true,
          label: i18n.t("delete"),
          onPress: () => deleteConversation(conversation),
        });
      }
      return actions;
    },
    [togglePinned, toggleMuted, deleteConversation]
  );

  const renderConversationItem = ({ item }) => {
    if (item.isTopicsRow) {
      return (
        <TouchableOpacity
          style={styles.conversationCard}
          onPress={() => navigation.navigate("ThreadHomePage")}
        >
          <View style={styles.profileContainer}>
            <View style={[styles.profileImage, styles.iconAvatar, styles.topicsAvatar]}>
              <Ionicons name="documents" size={24} color="#ffffff" />
            </View>
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.groupName}>{i18n.t("topicsThreadsOverview")}</Text>
            <Text style={styles.recentMessage} numberOfLines={1}>
              {i18n.t("topicsThreadsSubtitle")}
            </Text>
          </View>
          {/* Counts replies in topics this user follows. Topics nobody follows
              never contribute, so this stays at zero unless somebody opted in. */}
          {topicUnread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {topicUnread > 99 ? "99+" : topicUnread}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      );
    }

    const lastMessage = getLastMessage(item);

    let title = i18n.t("privateChat");
    // Raw stored object path for the icon (private avatar or group icon); CachedImage
    // resolves + caches it on-device.
    const isGroupIcon = item.conversationType === "group";
    let rawIconUri = null;
    if (isGroupIcon) {
      rawIconUri = item.groupIcon || null;
    } else {
      const otherId = item.participants.find(
        (id) => String(id) !== String(user.id)
      );
      const otherProfile = (item.participantProfiles || []).find(
        (p) => String(p.id) === String(otherId)
      );
      rawIconUri = otherProfile?.profileImage || null;
    }

    if (item.conversationType === "private") {
      const otherParticipant = item.participants.find(
        (participantId) => String(participantId) !== String(user.id)
      );

      if (otherParticipant) {
        const participantData = (item.participantProfiles || []).find(
          (p) => String(p.id) === String(otherParticipant)
        );
        title = participantData
          ? formatName(participantData.firstName, participantData.lastName)
          : i18n.t("unknownUser");
      }
    } else {
      title = groupDisplayName(item, language);
    }

    const unreadCount = getUnreadMessageCount(item, user.id);
    const onlineCount = getOnlineUserCount(item);

    const isPrivateChat = item.conversationType === "private";
    const otherParticipantId = isPrivateChat
      ? item.participants.find((id) => String(id) !== String(user.id))
      : null;

    // Use id-based presence lookup (no emails needed client-side)
    const isOnline =
      isPrivateChat && userStatus[String(otherParticipantId)] === "online";
    const draft = drafts?.[String(item.conversationId)] || "";
    const rowActions = rowActionsFor(item);

    // Swipe (on a phone) or hold (everywhere) for pin, mute and delete.
    return (
      <SwipeableRow actions={rowActions}>
        <TouchableOpacity
          style={styles.conversationCard}
          onPress={() => handleChat(item)}
          onLongPress={
            rowActions.length
              ? () => setRowSheet({ visible: true, title, actions: rowActions })
              : undefined
          }
          delayLongPress={350}
        >
          {/* Profile Image & Online Indicator */}
          <View style={styles.profileContainer}>
            {item.appLevel && !rawIconUri ? (
              // The church-wide group has no photo until an admin sets one, and the
              // default single-person avatar would read as a private chat.
              <View style={[styles.profileImage, styles.iconAvatar]}>
                <Ionicons name="people" size={26} color="#ffffff" />
              </View>
            ) : (
              <CachedImage
                uri={rawIconUri}
                type={isGroupIcon ? "group" : "profile"}
                conversationId={isGroupIcon ? item.conversationId : undefined}
                fallbackSource={defaultProfileImage}
                style={styles.profileImage}
              />
            )}

            {/* Online Indicator for Private Chat */}
            {isPrivateChat && isOnline && <View style={styles.onlineIndicator} />}

            {/* Online Count Badge for Group Chat */}
            {!isPrivateChat && onlineCount > 0 && (
              <View style={styles.groupOnlineIndicator}>
                <Text style={styles.groupOnlineText}>{onlineCount}</Text>
              </View>
            )}
          </View>

          {/* Chat Name & Last Message */}
          <View style={styles.textContainer}>
            <View style={styles.titleRow}>
              {/* Pinned by the reader (the app-level group is always on top and
                  says nothing); muted shows a struck bell. */}
              {item.pinned && !item.appLevel && (
                <Ionicons name="pin" size={13} color="#f97316" style={styles.titleIcon} />
              )}
              <Text style={styles.groupName} numberOfLines={1}>
                {title}
              </Text>
              {item.muted && (
                <Ionicons name="notifications-off-outline" size={14} color="#9ca3af" style={styles.titleIconAfter} />
              )}
            </View>

            <Text style={styles.recentMessage} numberOfLines={1}>
              {/* Someone called you out by name in here and you haven't read it.
                  Worth spotting at a glance even in a busy — or muted — group,
                  where the unread count alone says nothing about urgency. */}
              {item.mentioned && <Text style={styles.mentionMarker}>[@] </Text>}
              {/* Unsent words outrank the last message: they are what the reader
                  will see first when they open the chat. */}
              {draft ? (
                <>
                  <Text style={styles.draftMarker}>[{i18n.t("draft")}] </Text>
                  {draft}
                </>
              ) : lastMessage ? (
                <>
                  {!!lastMessage.senderFullName && (
                    <Text style={styles.participantName}>
                      {lastMessage.senderFullName}:{" "}
                    </Text>
                  )}
                  {lastMessage.previewContent}{" "}
                  {/* <Text style={styles.deliveryStatus}>({lastMessage.deliveryStatusIcon})</Text> */}
                  {String(lastMessage.senderId) === String(user.id) &&
                    !!lastMessage.deliveryStatusIcon && (
                      <Text style={styles.deliveryStatus}>
                        ({lastMessage.deliveryStatusIcon})
                      </Text>
                    )}
                </>
              ) : (
                <Text>{i18n.t("noMsg")}</Text>
              )}
            </Text>
          </View>

          {/* Unread Message Badge */}
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </SwipeableRow>
    );
  };

  if (showInitialLoader) {
    return (
      <SafeAreaView style={styles.loaderScreen}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loaderCard}>
          <ActivityIndicator size="small" color="#8E8E93" />
          <Text style={styles.loaderText}>{i18n.t("loadingChat")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.searchBarWrapper}>
        <TextInput
          style={styles.searchBar}
          placeholder={i18n.t("searchConversations")}
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </View>
      <FlatList
        data={listData}
        keyExtractor={(item) => item.conversationId.toString()}
        renderItem={renderConversationItem}
        ListEmptyComponent={
          <Text style={styles.noConversations}>{i18n.t("noMsg")}</Text>
        }
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />

      <ConversationActionSheet
        visible={rowSheet.visible}
        title={rowSheet.title}
        actions={rowSheet.actions}
        onClose={() => setRowSheet({ visible: false, title: "", actions: [] })}
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate("NewChat")}
      >
        <Text style={styles.addButtonText}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  loaderScreen: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  loaderCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.98)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  loaderText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9", // soft, modern contrast background
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  searchBarWrapper: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12, // match conversationCard horizontal padding
    paddingVertical: 10,
  },
  searchBar: {
    // minHeight, not height: a fixed box clips the text at large system fonts.
    minHeight: 44,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#d1d5db",
    fontSize: 16,
  },

  conversationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb", // subtle divider
  },
  profileContainer: {
    position: "relative",
  },
  profileImage: {
    width: 54,
    height: 54,
    borderRadius: 27, // 👈 circular
    marginRight: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  // Stand-in avatar for rows that represent a place rather than a person.
  iconAvatar: {
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
  },
  // Threads are a different kind of place from a chat, so the row reads as one.
  topicsAvatar: {
    backgroundColor: "#0F766E",
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleIcon: {
    marginRight: 4,
  },
  titleIconAfter: {
    marginLeft: 6,
  },
  groupName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 2,
  },
  recentMessage: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 22,
  },
  participantName: {
    fontWeight: "500",
    color: "#3b82f6",
  },
  mentionMarker: {
    color: "#f97316",
    fontWeight: "800",
  },
  draftMarker: {
    color: "#ef4444",
    fontWeight: "700",
  },
  deliveryStatus: {
    fontSize: 12,
    color: "#9ca3af",
  },
  unreadBadge: {
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 12,
    height: 12,
    backgroundColor: "#10b981", // green online dot
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  groupOnlineIndicator: {
    position: "absolute",
    bottom: 5,
    right: 5,
    width: 18,
    height: 18,
    backgroundColor: "#10b981",
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
  },
  groupOnlineText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },
  noConversations: {
    fontSize: 16,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 40,
  },
  addButton: {
    position: "absolute",
    // The tab bar takes part in layout rather than floating over the screen
    // (no position:absolute on tabBarStyle), so this 24 is already measured from
    // just above it. Adding the tab bar height on top lifted the button by a
    // second bar's worth.
    bottom: 24,
    right: 24,
    backgroundColor: "#3b82f6",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  addButtonText: {
    fontSize: 32,
    color: "#ffffff",
    fontWeight: "bold",
  },
});

export default ChatHomePage;
