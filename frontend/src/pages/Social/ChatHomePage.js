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
import {
  compareConversations,
  groupDisplayName,
} from "../../utils/conversationDisplay";
import { LanguageContext } from "../../context/LanguageContext";

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
  } = useContext(ChatContext);

  const [selectedUser, setSelectedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  // const [filteredConversations, setFilteredConversations] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

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

    if (conversation.conversationType === "private") {
      const otherParticipantIndex = conversation.participants.findIndex(
        (id) => String(id) !== String(user.id)
      );
      lastMessage.senderFullName =
        String(lastMessage.senderId) === String(user.id)
          ? "You"
          : conversation.participantNames[otherParticipantIndex] || "Unknown";
    }

    if (conversation.conversationType === "group") {
      lastMessage.senderFullName =
        String(lastMessage.senderId) === String(user.id)
          ? "You"
          : `${lastMessage.senderFirstName} ${lastMessage.senderLastName}`;
    }

    // ✅ Replace non-text content previews with user-friendly labels
    const messageType = String(lastMessage.type || "").toLowerCase();
    if (messageType === "image") {
      lastMessage.previewContent = "🖼️ Photo";
    } else if (messageType === "voice") {
      lastMessage.previewContent = "🎤 Voice message";
    } else {
      lastMessage.previewContent = lastMessage.content;
    }

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

    return (
      <TouchableOpacity
        style={styles.conversationCard}
        onPress={() => handleChat(item)}
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
          <Text style={styles.groupName}>{title}</Text>

          <Text style={styles.recentMessage} numberOfLines={1}>
            {/* Someone called you out by name in here and you haven't read it.
                Worth spotting at a glance even in a busy — or muted — group,
                where the unread count alone says nothing about urgency. */}
            {item.mentioned && <Text style={styles.mentionMarker}>[@] </Text>}
            {lastMessage ? (
              <>
                <Text style={styles.participantName}>
                  {lastMessage.senderFullName}:{" "}
                </Text>
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
    height: 44,
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
  groupName: {
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
