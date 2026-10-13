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
  View,
  ActivityIndicator,
  FlatList,
  StatusBar,
  TouchableOpacity,
} from "react-native";
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
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import {
  compareConversations,
  groupDisplayName,
} from "../../utils/conversationDisplay";
import { LanguageContext } from "../../context/LanguageContext";
import { makeStyles, useTheme } from "../../theme";
import { AppText, Avatar, Card, TextField } from "../../components/ui";

const ChatHomePage = () => {
  const styles = useStyles();
  const { colors } = useTheme();
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

    // ✅ Replace non-text content previews with user-friendly labels
    const messageType = String(lastMessage.type || "").toLowerCase();
    if (messageType === "image") {
      lastMessage.previewContent = i18n.t("chatPreviewPhoto");
    } else if (messageType === "voice") {
      lastMessage.previewContent = i18n.t("chatPreviewVoice");
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
          accessibilityRole="button"
        >
          <View style={styles.profileContainer}>
            <Avatar icon="documents" color="chat.topicsAvatar" style={styles.avatar} />
          </View>
          <View style={styles.textContainer}>
            <AppText variant="body" color="textPrimary" weight="semibold">
              {i18n.t("topicsThreadsOverview")}
            </AppText>
            <AppText variant="secondary" numberOfLines={1}>
              {i18n.t("topicsThreadsSubtitle")}
            </AppText>
          </View>
          {/* Counts replies in topics this user follows. Topics nobody follows
              never contribute, so this stays at zero unless somebody opted in. */}
          {topicUnread > 0 && (
            <View style={styles.unreadBadge}>
              <AppText variant="caption" color="onPrimary" weight="bold">
                {topicUnread > 99 ? "99+" : topicUnread}
              </AppText>
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
        accessibilityRole="button"
      >
        {/* Profile Image & Online Indicator */}
        <View style={styles.profileContainer}>
          {item.appLevel && !rawIconUri ? (
            // The church-wide group has no photo until an admin sets one, and the
            // default single-person avatar would read as a private chat.
            <Avatar icon="people" style={styles.avatar} />
          ) : (
            <Avatar
              uri={rawIconUri}
              type={isGroupIcon ? "group" : "profile"}
              conversationId={item.conversationId}
              bordered
              style={styles.avatar}
            />
          )}

          {/* Online Indicator for Private Chat */}
          {isPrivateChat && isOnline && <View style={styles.onlineIndicator} />}

          {/* Online Count Badge for Group Chat */}
          {!isPrivateChat && onlineCount > 0 && (
            <View style={styles.groupOnlineIndicator}>
              <AppText
                variant="caption"
                color="onPrimary"
                weight="bold"
                style={styles.groupOnlineText}
              >
                {onlineCount}
              </AppText>
            </View>
          )}
        </View>

        {/* Chat Name & Last Message */}
        <View style={styles.textContainer}>
          <AppText variant="body" color="textPrimary" weight="semibold">
            {title}
          </AppText>

          {/* Nested text repeats variant="secondary" so it keeps the line's size. */}
          <AppText variant="secondary" numberOfLines={1}>
            {/* Someone called you out by name in here and you haven't read it.
                Worth spotting at a glance even in a busy — or muted — group,
                where the unread count alone says nothing about urgency. */}
            {item.mentioned && (
              <AppText variant="secondary" weight="bold" style={styles.mentionMarker}>
                [@]{" "}
              </AppText>
            )}
            {lastMessage ? (
              <>
                {!!lastMessage.senderFullName && (
                  <AppText variant="secondary" color="primary" weight="semibold">
                    {lastMessage.senderFullName}:{" "}
                  </AppText>
                )}
                {lastMessage.previewContent}{" "}
                {String(lastMessage.senderId) === String(user.id) &&
                  !!lastMessage.deliveryStatusIcon && (
                    <AppText variant="caption" color="textDisabled">
                      ({lastMessage.deliveryStatusIcon})
                    </AppText>
                  )}
              </>
            ) : (
              i18n.t("noMsg")
            )}
          </AppText>
        </View>

        {/* Unread Message Badge */}
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <AppText variant="caption" color="onPrimary" weight="bold">
              {unreadCount > 99 ? "99+" : unreadCount}
            </AppText>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (showInitialLoader) {
    return (
      <SafeAreaView style={styles.loaderScreen}>
        <StatusBar barStyle="dark-content" />
        <Card variant="default" elevated padded={false} style={styles.loaderCard}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <AppText variant="secondary" weight="semibold" style={styles.loaderText}>
            {i18n.t("loadingChat")}
          </AppText>
        </Card>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.searchBarWrapper}>
        <TextField
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
          <AppText variant="body" color="textSecondary" style={styles.noConversations}>
            {i18n.t("noMsg")}
          </AppText>
        }
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />

      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate("NewChat")}
        accessibilityRole="button"
        accessibilityLabel={i18n.t("newChat")}
      >
        <AppText variant="button" style={styles.addButtonText}>
          +
        </AppText>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

// Layout only — text, avatars and the loader card get their look from the ui components.
const FAB_SIZE = 60;
const FAB_LABEL_SIZE = 32; // bold "+" — thicker than the add icon
const BADGE_SIZE = 22; // unread count pill
const ONLINE_DOT_SIZE = 12; // private chat presence dot
const GROUP_ONLINE_SIZE = 18; // group online count bubble
const INDICATOR_BORDER = 2; // white ring that separates a dot from the avatar

const useStyles = makeStyles((t) => ({
  loaderScreen: {
    flex: 1,
    backgroundColor: t.colors.backgroundMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  loaderCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: t.spacing.md,
    paddingHorizontal: t.spacing.base,
  },
  loaderText: {
    marginLeft: t.spacing.sm,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.backgroundMuted,
    paddingHorizontal: t.spacing.base,
    paddingTop: t.spacing.base,
  },
  searchBarWrapper: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.card,
    paddingHorizontal: t.spacing.md, // match conversationCard horizontal padding
    paddingVertical: t.spacing.sm,
  },
  searchBar: {
    // minHeight, not height: a fixed box clips the text at large system fonts.
    minHeight: t.sizes.minTouchTarget,
    backgroundColor: t.colors.surface,
  },

  conversationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.colors.surface,
    paddingVertical: t.spacing.base,
    paddingHorizontal: t.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.borderSubtle,
  },
  profileContainer: {
    position: "relative",
  },
  avatar: {
    marginRight: t.spacing.md,
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
  },
  mentionMarker: {
    color: t.colors.chat.mention,
  },
  unreadBadge: {
    backgroundColor: t.colors.badge,
    borderRadius: t.radius.full,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: t.spacing.xs,
    marginLeft: t.spacing.sm,
  },
  onlineIndicator: {
    position: "absolute",
    bottom: t.spacing.xs,
    right: t.spacing.xs,
    width: ONLINE_DOT_SIZE,
    height: ONLINE_DOT_SIZE,
    backgroundColor: t.colors.chat.online,
    borderRadius: t.radius.full,
    borderWidth: INDICATOR_BORDER,
    borderColor: t.colors.surface,
  },
  groupOnlineIndicator: {
    position: "absolute",
    bottom: t.spacing.xs,
    right: t.spacing.xs,
    width: GROUP_ONLINE_SIZE,
    height: GROUP_ONLINE_SIZE,
    backgroundColor: t.colors.chat.online,
    borderRadius: t.radius.full,
    borderWidth: INDICATOR_BORDER,
    borderColor: t.colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  // The bubble is only 14pt inside its ring, so the caption's 18pt line height
  // would clip the number.
  groupOnlineText: {
    lineHeight: t.typography.fontSize.xs,
  },
  noConversations: {
    textAlign: "center",
    marginTop: t.spacing["3xl"],
  },
  addButton: {
    position: "absolute",
    // The tab bar takes part in layout rather than floating over the screen
    // (no position:absolute on tabBarStyle), so this 24 is already measured from
    // just above it. Adding the tab bar height on top lifted the button by a
    // second bar's worth.
    bottom: t.spacing.xl,
    right: t.spacing.xl,
    backgroundColor: t.colors.primary,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: t.radius.full,
    justifyContent: "center",
    alignItems: "center",
    ...t.shadows.card,
  },
  addButtonText: {
    fontSize: FAB_LABEL_SIZE,
  },
}));

export default ChatHomePage;
