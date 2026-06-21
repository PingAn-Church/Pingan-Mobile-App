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
import { UserContext } from "../../context/UserContext";
import {
  getUserById,
  startPrivateChat,
  startGroupChat,
} from "../../service/UserService";
import { useNavigation } from "@react-navigation/native";
import { ChatContext } from "../../context/ChatContext";
import * as ImagePicker from "expo-image-picker";
// import { getPresignedUploadUrl, getPresignedDownloadUrl } from "../../service/S3Service"; // Assuming this function handles S3 presigned URL requests
import {
  getPresignedUploadUrl,
  uploadFileToOSS,
  resolvePresignedAssetUrl,
} from "../../service/OSSService";
import { getStompClient } from "../../service/WebSocketService";
import defaultProfileImage from "../../../assets/user.png";
import i18n from "../../../i18n";
import { LanguageContext } from "../../context/LanguageContext";

const ChatHomePage = () => {
  const { user, loading, userStatus } = useContext(UserContext);
  const {
    conversations,
    loading: loadingConversations,
    updateConversation,
    setConversations,
    fetchInitialData,
  } = useContext(ChatContext);

  const [selectedUser, setSelectedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  // const [filteredConversations, setFilteredConversations] = useState([]);
  const [chatIconUrls, setChatIconUrls] = useState({});
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

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      const lastMessageA = a.chatHistory?.[a.chatHistory.length - 1];
      const lastMessageB = b.chatHistory?.[b.chatHistory.length - 1];

      const timeA = Math.max(
        lastMessageA ? new Date(lastMessageA.timestamp).getTime() : 0,
        a.updatedAt || 0
      );

      const timeB = Math.max(
        lastMessageB ? new Date(lastMessageB.timestamp).getTime() : 0,
        b.updatedAt || 0
      );

      return timeB - timeA;
    });
  }, [conversations]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return sortedConversations;

    const lowercasedQuery = searchQuery.toLowerCase();

    return sortedConversations.filter((conversation) => {
      // Group: check groupName
      if (conversation.conversationType === "group") {
        return (conversation.groupName || "")
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
  }, [sortedConversations, searchQuery]);

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("chatHome"),
      headerBackTitle: i18n.t("back"),
    });
  }, [language]);

  useEffect(() => {
    handleSearch(searchQuery); // Reapply search filter to updated conversations
  }, [conversations]);

  useEffect(() => {
    const updateChatIcons = async () => {
      const newChatIconUrls = {};
      for (const conversation of conversations) {
        let iconUrl = null;

        if (conversation.conversationType === "private") {
          const otherParticipantId = conversation.participants.find(
            (id) => String(id) !== String(user.id)
          );
          const otherParticipant = (conversation.participantProfiles || []).find(
            (p) => String(p.id) === String(otherParticipantId)
          );
          if (otherParticipant?.profileImage) {
            iconUrl = await fetchViewingPresignedUrl(
              otherParticipant.profileImage,
              "profile"
            );
            console.log("PRIVATE ICON URL", iconUrl);
          }
        } else if (
          conversation.conversationType === "group" &&
          conversation.groupIcon
        ) {
          iconUrl = await fetchViewingPresignedUrl(
            conversation.groupIcon,
            "group"
          );
        }

        newChatIconUrls[conversation.conversationId] = iconUrl ?? "default";
      }
      setChatIconUrls(newChatIconUrls);
    };

    updateChatIcons();
  }, [conversations]);

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

  const fetchViewingPresignedUrl = async (imageUrl, type) => {
    return resolvePresignedAssetUrl(imageUrl, type);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
  };

  const getLastMessage = (conversation) => {
    const { chatHistory } = conversation;

    if (!chatHistory || chatHistory.length === 0) return null;

    if (!user) {
      console.warn("⚠️ User is null, skipping last message processing.");
      return null; // Prevents crash when user logs out
    }

    const lastMessage = chatHistory[chatHistory.length - 1];

    console.log("LAST MESSAGE", lastMessage);

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

    const deliveryStatuses = Object.values(lastMessage.deliveryStatus || []);

    // Determine delivery icon based on minimum status
    let deliveryIcon = "✔"; // Default: SENT
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

  const getUnreadMessageCount = (conversation, userId) => {
    return conversation.chatHistory
      ? conversation.chatHistory.filter(
          (msg) =>
            msg.senderId !== userId && msg.deliveryStatus?.[userId] !== "READ"
        ).length
      : 0;
  };

  const getOnlineUserCount = (conversation) => {
    return conversation.participants.reduce((count, participantId) => {
      return userStatus[String(participantId)] === "online" ? count + 1 : count;
    }, 0);
  };

  const renderConversationItem = ({ item }) => {
    const lastMessage = getLastMessage(item);

    let title = i18n.t("privateChat");
    // let chatIconUrl = chatIconUrls[item.conversationId] || "https://via.placeholder.com/50";
    const chatIconUrl = chatIconUrls[item.conversationId];
    // const chatIconSource = chatIconUrl ? { uri: chatIconUrl } : defaultProfileImage;
    const chatIconSource =
      chatIconUrl && chatIconUrl !== "default"
        ? { uri: chatIconUrl }
        : defaultProfileImage;

    if (item.conversationType === "private") {
      const otherParticipant = item.participants.find(
        (participantId) => String(participantId) !== String(user.id)
      );

      if (otherParticipant) {
        const participantData = (item.participantProfiles || []).find(
          (p) => String(p.id) === String(otherParticipant)
        );
        title = participantData
          ? `${participantData.firstName} ${participantData.lastName}`
          : i18n.t("unknownUser");
      }
    } else {
      title = item.groupName || i18n.t("groupChat");
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
          {/* <Image source={{ uri: chatIconUrl }} style={styles.profileImage} /> */}
          <Image source={chatIconSource} style={styles.profileImage} />

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
            {lastMessage ? (
              <>
                <Text style={styles.participantName}>
                  {lastMessage.senderFullName}:{" "}
                </Text>
                {lastMessage.previewContent}{" "}
                {/* <Text style={styles.deliveryStatus}>({lastMessage.deliveryStatusIcon})</Text> */}
                {String(lastMessage.senderId) === String(user.id) && (
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
            <Text style={styles.unreadText}>{unreadCount}</Text>
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
        data={filteredConversations}
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

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     justifyContent: "flex-start",
//     paddingTop: 10,
//     paddingHorizontal: 20,
//     backgroundColor: "#f2f2f7",
//   },
//   searchBar: {
//     height: 40,
//     borderColor: "#ccc",
//     borderWidth: 1,
//     paddingLeft: 8,
//     marginBottom: 10,
//   },
//   conversationCard: {
//     flexDirection: "row",
//     alignItems: "center",
//     backgroundColor: "#fff",
//     borderRadius: 12,
//     padding: 15,
//     marginBottom: 10,
//     borderWidth: 1,
//     borderColor: "#d1d1d6",
//   },
//   profileContainer: {
//     position: "relative",
//   },
//   profileImage: {
//     width: 50,
//     height: 50,
//     borderRadius: 25,
//     marginRight: 15,
//   },
//   textContainer: {
//     flex: 1,
//   },
//   groupName: {
//     fontSize: 16,
//     fontWeight: "600",
//     color: "#333",
//   },
//   recentMessage: {
//     fontSize: 14,
//     color: "#8e8e93",
//     marginTop: 5,
//   },
//   participantName: {
//     fontSize: 14,
//     color: "#007aff",
//     fontWeight: "600",
//     marginLeft: 5,
//   },
//   noConversations: {
//     fontSize: 16,
//     color: "#8e8e93",
//     textAlign: "center",
//   },
//   addButton: {
//     position: "absolute",
//     bottom: 20,
//     right: 20,
//     width: 60,
//     height: 60,
//     borderRadius: 30,
//     backgroundColor: "#007aff",
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   addButtonText: {
//     fontSize: 36,
//     color: "#fff",
//   },
//   pickerContainer: {
//     position: "absolute",
//     bottom: 60,
//     left: 0,
//     right: 0,
//     backgroundColor: "#fff",
//     padding: 20,
//     maxHeight: "50%", // Prevents it from taking too much space
//     flexGrow: 1,
//   },
//   flatList: {
//     maxHeight: 250, // Ensures list is scrollable
//   },
//   userText: {
//     padding: 10,
//     fontSize: 16,
//   },
//   buttonContainer: {
//     flexDirection: "row", // Arrange buttons in a row
//     justifyContent: "space-between", // Ensures spacing between buttons
//     marginTop: 10,
//   },
//   button: {
//     flex: 1, // Each button takes up equal space
//     alignItems: "center",
//     padding: 10,
//     backgroundColor: "#007aff", // Blue color for buttons
//     borderRadius: 8,
//     marginHorizontal: 5, // Add spacing between buttons
//   },
//   buttonText: {
//     color: "#fff",
//     fontSize: 16,
//     fontWeight: "bold",
//   },
//   modalContainer: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: "rgba(0, 0, 0, 0.5)",
//   },
//   modalContent: {
//     backgroundColor: "#fff",
//     padding: 20,
//     borderRadius: 10,
//     width: "80%",
//   },
//   input: {
//     height: 40,
//     borderColor: "#ccc",
//     borderWidth: 1,
//     marginBottom: 10,
//     paddingLeft: 8,
//   },
//   image: {
//     width: 100,
//     height: 100,
//     borderRadius: 8,
//     marginVertical: 10,
//   },
//   deliveryStatus: {
//     fontSize: 12,
//     color: "#888", // Gray color for subtle appearance
//     marginLeft: 5,
//   },
//   unreadBadge: {
//     backgroundColor: "red",
//     borderRadius: 12,
//     minWidth: 24,
//     height: 24,
//     justifyContent: "center",
//     alignItems: "center",
//     marginLeft: 10,
//   },
//   unreadText: {
//     color: "#fff",
//     fontSize: 14,
//     fontWeight: "bold",
//   },
//   onlineIndicator: {
//     position: "absolute",
//     bottom: 5,
//     right: 5,
//     width: 12,
//     height: 12,
//     backgroundColor: "#34C759",
//     borderRadius: 6,
//     borderWidth: 2,
//     borderColor: "#ffffff",
//   },
//   titleRow: {
//     flexDirection: "row",
//     alignItems: "center",
//   },
//   onlineBadge: {
//     backgroundColor: "#007aff",
//     borderRadius: 12,
//     paddingHorizontal: 6,
//     marginLeft: 8,
//   },
//   onlineText: {
//     color: "#fff",
//     fontSize: 14,
//     fontWeight: "bold",
//   },
//   groupOnlineIndicator: {
//     position: "absolute",
//     bottom: 5,
//     right: 5,
//     width: 20,
//     height: 20,
//     backgroundColor: "#34C759",
//     borderRadius: 10,
//     borderWidth: 2,
//     borderColor: "#ffffff",
//     justifyContent: "center",
//     alignItems: "center",
//   },
//   groupOnlineText: {
//     color: "#fff",
//     fontSize: 12,
//     fontWeight: "bold",
//   },
// });

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
