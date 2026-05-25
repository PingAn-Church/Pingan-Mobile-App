import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  useWindowDimensions,
  Animated,
  Easing,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import defaultProfileImage from "../../../assets/user.png";
import i18n from "../../../i18n";
import { translateText } from "../../service/TranslateService";
import { UserContext } from "../../context/UserContext";
import { ChatContext } from "../../context/ChatContext";
import { LanguageContext } from "../../context/LanguageContext";
import {
  sendMessageToDatabase,
  deleteMessageFromDatabase,
  editMessageInDatabase,
} from "../../service/ChatService";
import {
  getConversationDownloadUrl,
  getConversationUploadUrl,
  getPresignedUploadUrl,
  resolvePresignedAssetUrl,
  uploadFileToOSS,
} from "../../service/OSSService";
import { getStompClient } from "../../service/WebSocketService";
import { getAllUsers, getUserById, startGroupChat, startPrivateChat } from "../../service/UserService";
import VoiceRecorder from "../../components/Chat/VoiceRecorder";
import VoicePlayer from "../../components/Chat/VoicePlayer";
import DetailedPrivateChatPage from "./DetailedPrivateChatPage";
import DetailedGroupChatPage from "./DetailedGroupChatPage";
import { confirmAction } from "../../utils/confirmAction";

const normalizeDate = (raw) => {
  if (!raw) return null;
  const normalized =
    typeof raw === "string" && raw.includes(" ") && !raw.includes("T")
      ? raw.replace(" ", "T") + "Z"
      : raw;

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getMessageDate = (msg) => normalizeDate(msg?.timestamp) || normalizeDate(msg?.createdAt) || new Date(0);

const formatTime = (msg) => {
  const date = getMessageDate(msg);
  return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(date);
};

const sortByTimeAscending = (a, b) => getMessageDate(a) - getMessageDate(b);
const dedupeHistoryByMessageId = (history = []) => {
  const deduped = [];
  const indexByMessageId = new Map();

  history.forEach((msg) => {
    const messageId = msg?.messageId;
    if (messageId === null || messageId === undefined) {
      deduped.push(msg);
      return;
    }

    const key = String(messageId);
    const existingIndex = indexByMessageId.get(key);

    if (existingIndex === undefined) {
      indexByMessageId.set(key, deduped.length);
      deduped.push(msg);
      return;
    }

    // Prefer non-pending/confirmed data when duplicates share the same messageId.
    const existing = deduped[existingIndex];
    if (existing?.pending && !msg?.pending) {
      deduped[existingIndex] = { ...existing, ...msg };
    } else {
      deduped[existingIndex] = { ...msg, ...existing };
    }
  });

  return deduped.sort(sortByTimeAscending);
};
const isLocalOnlyMessage = (message) =>
  typeof message?.messageId === "string" && message.messageId.startsWith("local-");
const parseVoiceContent = (content) => {
  if (!content) return { audioUrl: "", duration: 0 };
  const [audioUrl, durationPart] = String(content).split("|");
  return {
    audioUrl: audioUrl || "",
    duration: Number.parseInt(durationPart, 10) || 0,
  };
};
const getVoiceUploadConfig = (audioUri) => {
  const cleanUri = String(audioUri || "").split("?")[0].split("#")[0];
  const extension = cleanUri.includes(".")
    ? cleanUri.split(".").pop().toLowerCase()
    : "";

  if (Platform.OS === "web") {
    return { contentType: "audio/webm", fileExtension: "webm" };
  }

  if (extension === "mp3") {
    return { contentType: "audio/mpeg", fileExtension: "mp3" };
  }

  if (extension === "wav") {
    return { contentType: "audio/wav", fileExtension: "wav" };
  }

  return { contentType: "audio/mp4", fileExtension: "m4a" };
};

const getCleanAssetUri = (value) => String(value || "").split("?")[0].split("#")[0];

const getFileExtensionFromUri = (value, fallback = "jpg") => {
  const cleanUri = getCleanAssetUri(value);
  const fileName = cleanUri.split("/").pop() || "";
  if (!fileName.includes(".")) return fallback;

  const extension = fileName.split(".").pop().toLowerCase();
  return extension || fallback;
};

const buildChatImageFileName = (message, uri) => {
  const messageId = message?.messageId || message?.localId || Date.now();
  const extension = getFileExtensionFromUri(uri, "jpg");
  return `chat-image-${messageId}.${extension}`;
};

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const normalizeTranslationLanguage = (languageCode) => {
  const raw = String(languageCode || "en").trim().toLowerCase();
  const base = raw.split("-")[0];
  return base === "zh" ? "zh" : "en";
};

const containsChineseChars = (value) => /[\u3400-\u9FFF\uF900-\uFAFF]/.test(String(value || ""));
const containsLatinChars = (value) => /[A-Za-z]/.test(String(value || ""));

const resolveTargetTranslationLanguage = (content, appLanguage) => {
  if (containsChineseChars(content)) {
    return "en";
  }

  if (containsLatinChars(content)) {
    return "zh";
  }

  return normalizeTranslationLanguage(appLanguage);
};

const normalizeDeliveryState = (value) => {
  const raw = String(value || "").toUpperCase();
  if (raw === "READ") return "seen";
  if (raw === "DELIVERED") return "delivered";
  if (raw === "SENT") return "sent";
  return null;
};

const resolveOutgoingDeliveryState = (deliveryStatusMap, currentUserId) => {
  const recipientStates = Object.entries(deliveryStatusMap || {})
    .filter(([recipientId]) => String(recipientId) !== String(currentUserId))
    .map(([, status]) => normalizeDeliveryState(status))
    .filter(Boolean);

  if (!recipientStates.length) return null;
  if (recipientStates.includes("seen")) return "seen";
  if (recipientStates.includes("delivered")) return "delivered";
  if (recipientStates.includes("sent")) return "sent";
  return null;
};

const formatDeliveryStateLabel = (state) => {
  if (state === "seen") return "Seen";
  if (state === "delivered") return "Delivered";
  if (state === "sent") return "Sent";
  return "";
};

const getConversationSortTime = (conversation) => {
  const history = conversation?.chatHistory || [];
  const lastMessage = history[history.length - 1];
  const lastMessageTime = getMessageDate(lastMessage)?.getTime() || 0;
  return Math.max(lastMessageTime, Number(conversation?.updatedAt) || 0);
};

const getConversationPreview = (conversation, currentUserId) => {
  const history = conversation?.chatHistory || [];
  const lastMessage = history[history.length - 1];
  if (!lastMessage) return i18n.t("chat");

  const messageType = String(lastMessage?.type || "text").toLowerCase();
  let content = String(lastMessage?.content || "");

  if (messageType === "image") content = "🖼️ Photo";
  if (messageType === "voice") content = "🎤 Voice message";

  const isMine = String(lastMessage?.senderId) === String(currentUserId);
  return isMine ? `You: ${content}` : content;
};

const webFontSize = (baseSize) => (Platform.OS === "web" ? baseSize + 7 : baseSize);

export default function ChatPage({ route }) {
  const conversationId = route?.params?.conversationId ?? route?.params?.id ?? null;

  const { user: currentUser } = useContext(UserContext);
  const { conversations, setConversations } = useContext(ChatContext);
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();

  const [inputText, setInputText] = useState("");
  const [editingMessage, setEditingMessage] = useState(null);
  const [conversationIconUrls, setConversationIconUrls] = useState({});
  const [userDirectory, setUserDirectory] = useState({});
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  const [showWebNewChatPanel, setShowWebNewChatPanel] = useState(false);
  const [showWebCreateGroupPanel, setShowWebCreateGroupPanel] = useState(false);
  const [showWebChatMenu, setShowWebChatMenu] = useState(false);
  const [newChatUsers, setNewChatUsers] = useState([]);
  const [loadingNewChatUsers, setLoadingNewChatUsers] = useState(false);
  const [newChatSearchQuery, setNewChatSearchQuery] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupSearchQuery, setNewGroupSearchQuery] = useState("");
  const [newGroupSelectedParticipants, setNewGroupSelectedParticipants] = useState([]);
  const [newGroupImageUri, setNewGroupImageUri] = useState(null);
  const [uploadingNewGroupImage, setUploadingNewGroupImage] = useState(false);
  const [creatingNewGroup, setCreatingNewGroup] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [isDetailsPanelMounted, setIsDetailsPanelMounted] = useState(false);
  const [imagePresignedUrls, setImagePresignedUrls] = useState({});
  const [conversation, setConversation] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [conversationType, setConversationType] = useState("");
  const [isSendingText, setIsSendingText] = useState(false);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    message: null,
  });
  const [contextMenuSize, setContextMenuSize] = useState({ width: 0, height: 0 });
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && windowWidth >= 1024;
  const webDesktopSidebarWidth = windowWidth > 1600 ? 600 : windowWidth > 1400 ? 400 : 300;

  const [translations, setTranslations] = useState({});
  const [translatingId, setTranslatingId] = useState(null);
  const flatListRef = useRef(null);
  const textInputRef = useRef(null);
  const pendingAckTimersRef = useRef(new Map());
  const sendingTextLockRef = useRef(false);
  const sendingVoiceLockRef = useRef(false);
  const readReceiptSentRef = useRef(new Set());
  const detailsSidebarAnim = useRef(new Animated.Value(0)).current;

  const handleTranslate = async (message) => {
    const messageType = (message?.type || "text").toLowerCase();
    if (messageType !== "text") return;

    const messageIdKey = String(message?.messageId || "");
    const sourceContent = String(message?.content || "").trim();
    if (!messageIdKey || !sourceContent) return;

    const targetLang = resolveTargetTranslationLanguage(sourceContent, language);
    const existing = translations[messageIdKey];
    const isSameSource =
      existing?.sourceContent === sourceContent && existing?.targetLang === targetLang;

    if (isSameSource && existing?.visible) {
      setTranslations((prev) => ({
        ...prev,
        [messageIdKey]: {
          ...prev[messageIdKey],
          visible: false,
        },
      }));
      return;
    }

    if (isSameSource && !existing?.visible) {
      setTranslations((prev) => ({
        ...prev,
        [messageIdKey]: {
          ...prev[messageIdKey],
          visible: true,
        },
      }));
      return;
    }

    if (translatingId === messageIdKey) return;

    setTranslatingId(messageIdKey);
    try {
      const translated = await translateText(sourceContent, targetLang);

      setTranslations((prev) => ({
        ...prev,
        [messageIdKey]: {
          text: translated,
          sourceContent,
          targetLang,
          visible: true,
        },
      }));
    } catch (error) {
      Alert.alert(i18n.t("error"), i18n.t("translationFailed"));
    } finally {
      setTranslatingId(null);
    }
  };

  useEffect(() => {
    navigation.setOptions({
      title: i18n.t("chat"),
      headerBackTitleVisible: false,
      headerBackTitle: "",
    });
  }, [language, navigation]);

  useEffect(() => {
    const fetchUsersDirectory = async () => {
      try {
        const users = await getAllUsers();
        const nextDirectory = {};

        const resolvedUsers = await Promise.all(
          (users || []).map(async (item) => ({
            ...item,
            profileImageUrl: await fetchViewingPresignedUrl(item?.profileImage, "profile"),
          }))
        );

        resolvedUsers.forEach((item) => {
          if (item?.id === null || item?.id === undefined) return;
          nextDirectory[String(item.id)] = item;
        });

        setUserDirectory(nextDirectory);
      } catch (error) {
        console.error("Failed to fetch users for chat icons:", error);
      }
    };

    fetchUsersDirectory();
  }, []);

  useEffect(() => {
    setTranslations({});
    setTranslatingId(null);
  }, [language, conversationId]);

  useEffect(() => {
    const conv = conversations.find((c) => Number(c.conversationId) === Number(conversationId));
    if (!conv) return;

    setConversation(conv);
    setConversationType(conv.conversationType);

    const fetchParticipantDetails = async () => {
      try {
        const userDetails = await Promise.all((conv.participants || []).map((id) => getUserById(id)));
        setParticipants(
          userDetails.map((u) => ({
            id: u.id,
            fullName: `${u.firstName} ${u.lastName}`,
            email: u.email,
            profileImage: u.profileImage,
          }))
        );
      } catch (error) {
        console.error(error);
      }
    };

    fetchParticipantDetails();
  }, [conversations, conversationId]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (conversationId !== null && conversationId !== undefined) return;
    if (!conversations?.length) return;

    const firstConversationId = conversations[0]?.conversationId;
    if (firstConversationId === null || firstConversationId === undefined) return;

    navigation.replace("Chat", { conversationId: firstConversationId });
  }, [conversationId, conversations, navigation]);

  const fetchViewingPresignedUrl = async (imageUrl, type) => {
    return resolvePresignedAssetUrl(imageUrl, type);
  };

  useEffect(() => {
    const loadConversationIcons = async () => {
      const nextIcons = {};

      await Promise.all(
        (conversations || []).map(async (conv) => {
          let iconUrl = null;

          if (conv?.conversationType === "group") {
            iconUrl = await fetchViewingPresignedUrl(conv?.groupIcon, "group");
          } else {
            const otherParticipantId = (conv?.participants || []).find(
              (participantId) => String(participantId) !== String(currentUser?.id)
            );
            const otherParticipant = userDirectory[String(otherParticipantId)];
            iconUrl =
              otherParticipant?.profileImageUrl ||
              (await fetchViewingPresignedUrl(otherParticipant?.profileImage, "profile"));
          }

          nextIcons[String(conv?.conversationId)] = iconUrl || "";
        })
      );

      setConversationIconUrls(nextIcons);
    };

    if (!conversations?.length) {
      setConversationIconUrls({});
      return;
    }

    loadConversationIcons();
  }, [conversations, currentUser?.id, userDirectory]);

  const privateChatParticipant = useMemo(
    () => participants.find((participant) => String(participant.id) !== String(currentUser?.id)) || null,
    [participants, currentUser?.id]
  );

  const privateChatParticipantId = useMemo(() => {
    if (privateChatParticipant?.id !== null && privateChatParticipant?.id !== undefined) {
      const parsedId = Number(privateChatParticipant.id);
      return Number.isFinite(parsedId) ? parsedId : null;
    }

    const fallbackId = (conversation?.participants || []).find(
      (participantId) => String(participantId) !== String(currentUser?.id)
    );
    const parsedFallbackId = Number(fallbackId);
    return Number.isFinite(parsedFallbackId) ? parsedFallbackId : null;
  }, [conversation?.participants, currentUser?.id, privateChatParticipant?.id]);

  const canOpenChatDetails =
    conversationType === "group" ||
    (conversationType === "private" && privateChatParticipantId !== null);

  const chatDisplayName =
    conversationType === "group"
      ? conversation?.groupName || "Group Chat"
      : privateChatParticipant?.fullName || "";

  const openDetailsPanel = useCallback(() => {
    if (!isWebDesktop) return;

    setIsDetailsPanelMounted(true);
    setShowDetailsPanel(true);
    detailsSidebarAnim.setValue(0);

    Animated.timing(detailsSidebarAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [detailsSidebarAnim, isWebDesktop]);

  const closeDetailsPanel = useCallback(() => {
    Animated.timing(detailsSidebarAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setShowDetailsPanel(false);
      setIsDetailsPanelMounted(false);
    });
  }, [detailsSidebarAnim]);

  const handleOpenChatDetails = () => {
    if (isWebDesktop) {
      openDetailsPanel();
      return;
    }

    if (conversationType === "group") {
      const parsedConversationId = Number(conversationId);
      navigation.navigate("DetailedGroupChat", {
        conversationId: Number.isFinite(parsedConversationId) ? parsedConversationId : conversationId,
      });
      return;
    }

    if (conversationType === "private" && privateChatParticipantId !== null) {
      navigation.navigate("DetailedPrivateChat", { otherParticipantId: privateChatParticipantId });
    }
  };

  useEffect(() => {
    return () => {
      pendingAckTimersRef.current.forEach((timer) => clearTimeout(timer));
      pendingAckTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    readReceiptSentRef.current.clear();
  }, [conversationId, currentUser?.id]);

  const closeContextMenu = () => {
    setContextMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  };

  const openContextMenu = (message, event) => {
    const pageX = event?.nativeEvent?.pageX;
    const pageY = event?.nativeEvent?.pageY;

    setContextMenu({
      visible: true,
      x: typeof pageX === "number" ? pageX : windowWidth / 2,
      y: typeof pageY === "number" ? pageY : windowHeight / 2,
      message,
    });
  };

  const contextMenuPosition = useMemo(() => {
    const horizontalMargin = 8;
    const verticalOffset = 10;
    const menuWidth = contextMenuSize.width || 170;
    const menuHeight = contextMenuSize.height || 180;

    let left = contextMenu.x - menuWidth / 2;
    left = Math.max(horizontalMargin, Math.min(left, windowWidth - menuWidth - horizontalMargin));

    let top = contextMenu.y + verticalOffset;
    if (top + menuHeight > windowHeight - horizontalMargin) {
      top = Math.max(horizontalMargin, contextMenu.y - menuHeight - verticalOffset);
    }

    return { left, top };
  }, [contextMenu.x, contextMenu.y, contextMenuSize.height, contextMenuSize.width, windowHeight, windowWidth]);

  const messages = useMemo(() => {
    const rawMessages = [...(conversation?.chatHistory || [])].sort(sortByTimeAscending);

    const grouped = [];
    let lastDateLabel = null;

    rawMessages.forEach((msg, idx) => {
      const msgDate = getMessageDate(msg);
      const dateLabel = msgDate.toLocaleDateString([], {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      if (dateLabel !== lastDateLabel) {
        grouped.push({ type: "date", id: `date-${dateLabel}-${idx}`, date: dateLabel });
        lastDateLabel = dateLabel;
      }

      grouped.push(msg);
    });

    return grouped.reverse();
  }, [conversation]);

  const updateConversationHistory = (updater) => {
    setConversations((prev) =>
      prev.map((conv) => {
        if (Number(conv.conversationId) !== Number(conversationId)) return conv;

        const nextHistory = dedupeHistoryByMessageId(updater(conv.chatHistory || []));
        return {
          ...conv,
          chatHistory: nextHistory,
          lastMessage: nextHistory.length ? nextHistory[nextHistory.length - 1] : conv.lastMessage,
        };
      })
    );
  };

  useEffect(() => {
    if (!currentUser?.id || !conversationId || !conversationType) return;

    const history = conversation?.chatHistory || [];
    if (!history.length) return;

    const client = getStompClient();
    if (!client?.connected) return;

    const parsedConversationId = Number(conversationId);
    const normalizedConversationId = Number.isFinite(parsedConversationId)
      ? parsedConversationId
      : conversationId;

    const messagesToMarkRead = history.filter((msg) => {
      if (!msg?.messageId || isLocalOnlyMessage(msg)) return false;
      if (String(msg.senderId) === String(currentUser.id)) return false;

      const statusForCurrentUser = String(msg.deliveryStatus?.[currentUser.id] || "").toUpperCase();
      if (statusForCurrentUser === "READ") return false;

      const receiptKey = `${normalizedConversationId}:${msg.messageId}:${currentUser.id}`;
      if (readReceiptSentRef.current.has(receiptKey)) return false;

      return true;
    });

    if (!messagesToMarkRead.length) return;

    messagesToMarkRead.forEach((msg) => {
      const receiptKey = `${normalizedConversationId}:${msg.messageId}:${currentUser.id}`;

      try {
        client.publish({
          destination: "/app/updateDeliveryStatus",
          body: JSON.stringify({
            messageId: msg.messageId,
            conversationId: normalizedConversationId,
            conversationType,
            senderId: msg.senderId,
            deliveryStatus: { [currentUser.id]: "READ" },
          }),
        });
        readReceiptSentRef.current.add(receiptKey);
      } catch (error) {
        console.error("Failed to publish READ receipt:", error);
      }
    });
  }, [
    conversation?.chatHistory,
    conversationId,
    conversationType,
    currentUser?.id,
  ]);

  const setAckTimeout = (localId) => {
    if (!localId) return;

    if (pendingAckTimersRef.current.has(localId)) {
      clearTimeout(pendingAckTimersRef.current.get(localId));
    }

    const timer = setTimeout(() => {
      updateConversationHistory((history) =>
        history.map((msg) =>
          msg.localId === localId && msg.pending ? { ...msg, pending: false, failed: true } : msg
        )
      );
      pendingAckTimersRef.current.delete(localId);
    }, 12000);

    pendingAckTimersRef.current.set(localId, timer);
  };

  const clearAckTimeout = (localId) => {
    if (!localId) return;

    const timer = pendingAckTimersRef.current.get(localId);
    if (timer) {
      clearTimeout(timer);
      pendingAckTimersRef.current.delete(localId);
    }
  };

  const replaceOptimisticMessage = (localId, serverMessage) => {
    updateConversationHistory((history) => {
      const index = history.findIndex(
        (msg) =>
          msg.localId === localId ||
          msg.clientMessageId === localId ||
          String(msg.messageId) === String(localId)
      );

      if (index === -1) {
        const existingServerIndex = history.findIndex(
          (msg) => String(msg.messageId) === String(serverMessage?.messageId)
        );

        if (existingServerIndex !== -1) {
          const next = [...history];
          next[existingServerIndex] = {
            ...next[existingServerIndex],
            ...serverMessage,
            pending: false,
            failed: false,
          };
          return next;
        }

        return [...history, { ...serverMessage, pending: false, failed: false }];
      }

      const next = [...history];
      next[index] = {
        ...next[index],
        ...serverMessage,
        pending: false,
        failed: false,
      };

      return next;
    });
  };

  const appendOptimisticMessage = (message) => {
    updateConversationHistory((history) => [...history, message].sort(sortByTimeAscending));
  };

  const clearMessageTranslation = (messageId) => {
    const messageIdKey = String(messageId || "");
    if (!messageIdKey) return;

    setTranslations((prev) => {
      if (!prev[messageIdKey]) return prev;
      const next = { ...prev };
      delete next[messageIdKey];
      return next;
    });
  };

  const handleSendOrUpdate = async () => {
    if (!inputText.trim() || !currentUser?.id || !conversationId || !conversationType) return;

    if (editingMessage) {
      const newText = inputText.trim();
      const oldText = editingMessage.content;
      const editedMessageId = editingMessage.messageId;

      updateConversationHistory((history) =>
        history.map((msg) =>
          String(msg.messageId) === String(editingMessage.messageId)
            ? { ...msg, content: newText, isEdited: true }
            : msg
        )
      );
      clearMessageTranslation(editedMessageId);

      setEditingMessage(null);
      setInputText("");
      Keyboard.dismiss();

      try {
        await editMessageInDatabase(
          editingMessage.messageId,
          newText,
          conversationId,
          conversationType
        );
      } catch (error) {
        updateConversationHistory((history) =>
          history.map((msg) =>
            String(msg.messageId) === String(editingMessage.messageId)
              ? { ...msg, content: oldText, isEdited: editingMessage.isEdited }
              : msg
          )
        );
        Alert.alert("Error", "Could not edit message");
      }

      return;
    }

    if (sendingTextLockRef.current || isSendingText) return;

    const trimmed = inputText.trim();
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();

    const optimisticMessage = {
      localId,
      clientMessageId: localId,
      messageId: localId,
      content: trimmed,
      conversationId,
      conversationType,
      senderId: currentUser.id,
      recipientIds: participants.map((p) => p.id).filter((id) => id !== currentUser.id),
      type: "text",
      deliveryStatus: {},
      createdAt,
      timestamp: createdAt,
      pending: true,
      failed: false,
    };

    appendOptimisticMessage(optimisticMessage);
    setInputText("");
    setAckTimeout(localId);

    const chatMessage = {
      content: trimmed,
      conversationId,
      conversationType,
      senderId: currentUser.id,
      recipientIds: participants.map((p) => p.id).filter((id) => id !== currentUser.id),
      type: "text",
      deliveryStatus: {},
      createdAt,
      clientMessageId: localId,
    };

    sendingTextLockRef.current = true;
    setIsSendingText(true);

    try {
      const persisted = await sendMessageToDatabase(chatMessage, conversationType);

      if (persisted?.messageId) {
        replaceOptimisticMessage(localId, persisted);
        clearAckTimeout(localId);
      }
    } catch (error) {
      updateConversationHistory((history) =>
        history.map((msg) => (msg.localId === localId ? { ...msg, pending: false, failed: true } : msg))
      );
      clearAckTimeout(localId);
      Alert.alert("Error", "Message failed to send");
    } finally {
      sendingTextLockRef.current = false;
      setIsSendingText(false);
    }
  };

  const handleDeleteMessage = async (message) => {
    if (!message?.messageId) return;

    const messageIdKey = String(message.messageId);
    const snapshotTranslation = messageIdKey ? translations[messageIdKey] : null;
    clearMessageTranslation(message.messageId);

    if (isLocalOnlyMessage(message)) {
      clearAckTimeout(message.localId || message.messageId);
      updateConversationHistory((history) =>
        history.filter((msg) => String(msg.messageId) !== String(message.messageId))
      );
      return;
    }

    const snapshot = message;
    updateConversationHistory((history) => history.filter((msg) => String(msg.messageId) !== String(message.messageId)));

    try {
      await deleteMessageFromDatabase(message.messageId, conversationId, conversationType);
    } catch (error) {
      updateConversationHistory((history) => [...history, snapshot].sort(sortByTimeAscending));
      if (snapshotTranslation) {
        setTranslations((prev) => ({ ...prev, [messageIdKey]: snapshotTranslation }));
      }
      Alert.alert("Error", "Could not delete message");
    }
  };

  const beginEditMessage = (message) => {
    setEditingMessage(message);
    setInputText(message.content || "");
    closeContextMenu();
    textInputRef.current?.focus();
  };

  const resolveImageUrl = async (objectKey) => {
    if (!objectKey) return null;
    if (imagePresignedUrls[objectKey]) return imagePresignedUrls[objectKey];

    try {
      const fileName = objectKey.split("/").pop();
      const presignedUrl = await getConversationDownloadUrl(fileName, conversationId);
      setImagePresignedUrls((prev) => ({ ...prev, [objectKey]: presignedUrl }));
      return presignedUrl;
    } catch (error) {
      return null;
    }
  };

  const resolveImageMessageUri = async (message) => {
    if (!message) return null;

    if (message.localPreviewUri) {
      return message.localPreviewUri;
    }

    return resolveImageUrl(message.content);
  };

  const copyImageMessage = async (message) => {
    const uri = await resolveImageMessageUri(message);
    if (!uri) {
      throw new Error("Image not available");
    }

    const response = await fetch(uri);
    const blob = await response.blob();

    if (
      Platform.OS === "web" &&
      typeof navigator !== "undefined" &&
      navigator.clipboard?.write &&
      typeof globalThis.ClipboardItem === "function"
    ) {
      await navigator.clipboard.write([
        new globalThis.ClipboardItem({
          [blob.type || "image/png"]: blob,
        }),
      ]);
      return;
    }

    const dataUrl = await blobToDataUrl(blob);
    const base64Payload = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;

    if (base64Payload) {
      await Clipboard.setImageAsync(base64Payload);
      return;
    }

    await Clipboard.setStringAsync(uri);
  };

  const downloadImageMessage = async (message) => {
    const uri = await resolveImageMessageUri(message);
    if (!uri) {
      throw new Error("Image not available");
    }

    const fileName = buildChatImageFileName(message, uri);
    const tempFileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;

    if (Platform.OS === "web") {
      const anchor = document.createElement("a");
      anchor.href = uri;
      anchor.download = fileName;
      anchor.rel = "noopener noreferrer";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }

    const permission = await MediaLibrary.requestPermissionsAsync(false, ["photo"]);
    if (!permission.granted) {
      throw new Error("Media library permission denied");
    }

    if (String(uri).startsWith("file://")) {
      await MediaLibrary.saveToLibraryAsync(uri);
      return;
    }

    const downloadDirectory = new Directory(Paths.cache, "chat-downloads");
    downloadDirectory.create({ idempotent: true, intermediates: true });
    const targetFile = new File(downloadDirectory, tempFileName);
    const downloadedFile = await File.downloadFileAsync(uri, targetFile, { idempotent: true });
    await MediaLibrary.saveToLibraryAsync(downloadedFile.uri);
  };

  const ImageWrapper = ({ message, isMe }) => {
    const [uri, setUri] = useState(message.localPreviewUri || null);

    useEffect(() => {
      let active = true;

      if (message.localPreviewUri && message.pending) {
        setUri(message.localPreviewUri);
        return () => {
          active = false;
        };
      }

      resolveImageUrl(message.content).then((resolved) => {
        if (active) setUri(resolved);
      });

      return () => {
        active = false;
      };
    }, [message.content, message.localPreviewUri, message.pending]);

    if (!uri) return <ActivityIndicator size="small" color={isMe ? "#FFFFFF" : "#0A84FF"} />;
    return (
      <TouchableOpacity activeOpacity={0.92} onPress={(event) => openContextMenu(message, event)}>
        <Image
          source={{ uri }}
          style={[styles.chatImage, isMe ? styles.chatImageSent : styles.chatImageReceived]}
        />
      </TouchableOpacity>
    );
  };

  const pickAndSendImage = async () => {
    if (!currentUser?.id || !conversationId || !conversationType) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (result.canceled) return;

    const imageUri = result.assets[0].uri;
    const localId = `local-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();

    appendOptimisticMessage({
      localId,
      clientMessageId: localId,
      messageId: localId,
      content: imageUri,
      localPreviewUri: imageUri,
      conversationId,
      conversationType,
      senderId: currentUser.id,
      recipientIds: participants.map((p) => p.id).filter((id) => id !== currentUser.id),
      type: "image",
      deliveryStatus: {},
      createdAt,
      timestamp: createdAt,
      pending: true,
      failed: false,
    });

    setAckTimeout(localId);

    try {
      const fileName = `chat_${Date.now()}.jpg`;
      const uploadUrl = await getConversationUploadUrl(fileName, conversationId);
      const uploadedUrl = await uploadFileToOSS(imageUri, uploadUrl);

      updateConversationHistory((history) =>
        history.map((msg) =>
          msg.localId === localId
            ? { ...msg, content: uploadedUrl, uploadedObjectKey: uploadedUrl }
            : msg
        )
      );

      const payload = {
        content: uploadedUrl,
        conversationId,
        conversationType,
        senderId: currentUser.id,
        recipientIds: participants.map((p) => p.id).filter((id) => id !== currentUser.id),
        type: "image",
        deliveryStatus: {},
        createdAt,
        clientMessageId: localId,
      };

      const persisted = await sendMessageToDatabase(payload, conversationType);
      if (persisted?.messageId) {
        replaceOptimisticMessage(localId, persisted);
        clearAckTimeout(localId);
      }
    } catch (error) {
      updateConversationHistory((history) =>
        history.map((msg) => (msg.localId === localId ? { ...msg, pending: false, failed: true } : msg))
      );
      clearAckTimeout(localId);
      Alert.alert("Error", "Image failed to send");
    }
  };

  const handleVoiceRecordingComplete = async (audioUri, duration) => {
    if (!currentUser?.id || !conversationId || !conversationType || !audioUri) return;
    if (sendingVoiceLockRef.current) return;
    sendingVoiceLockRef.current = true;

    const localId = `local-voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const parsedDuration = Number(duration);
    const durationInSeconds = Number.isFinite(parsedDuration) ? Math.max(0, Math.floor(parsedDuration)) : 0;
    const localVoiceContent = `${audioUri}|${durationInSeconds}`;

    appendOptimisticMessage({
      localId,
      clientMessageId: localId,
      messageId: localId,
      content: localVoiceContent,
      conversationId,
      conversationType,
      senderId: currentUser.id,
      recipientIds: participants.map((p) => p.id).filter((id) => id !== currentUser.id),
      type: "voice",
      deliveryStatus: {},
      createdAt,
      timestamp: createdAt,
      pending: true,
      failed: false,
    });

    setAckTimeout(localId);

    try {
      const { contentType: voiceContentType, fileExtension: voiceFileExtension } = getVoiceUploadConfig(audioUri);
      const fileName = `voice_${conversationId}_${Date.now()}.${voiceFileExtension}`;
      const uploadUrl = await getConversationUploadUrl(fileName, conversationId, voiceContentType);
      const uploadedUrl = await uploadFileToOSS(audioUri, uploadUrl, voiceContentType);
      const voiceContent = `${uploadedUrl}|${durationInSeconds}`;

      updateConversationHistory((history) =>
        history.map((msg) =>
          msg.localId === localId
            ? { ...msg, content: voiceContent }
            : msg
        )
      );

      const payload = {
        content: voiceContent,
        conversationId,
        conversationType,
        senderId: currentUser.id,
        recipientIds: participants.map((p) => p.id).filter((id) => id !== currentUser.id),
        type: "voice",
        deliveryStatus: {},
        createdAt,
        clientMessageId: localId,
      };

      const persisted = await sendMessageToDatabase(payload, conversationType);
      if (persisted?.messageId) {
        replaceOptimisticMessage(localId, persisted);
        clearAckTimeout(localId);
      }
    } catch (error) {
      updateConversationHistory((history) =>
        history.map((msg) => (msg.localId === localId ? { ...msg, pending: false, failed: true } : msg))
      );
      clearAckTimeout(localId);
      Alert.alert("Error", `Voice message failed to send.\n${error?.message || "Unknown upload error."}`);
    } finally {
      sendingVoiceLockRef.current = false;
    }
  };

  const isSendDisabled =
    !inputText.trim() ||
    !currentUser?.id ||
    !conversationId ||
    !conversationType ||
    (!editingMessage && isSendingText);

  const contextMessage = contextMenu.message;
  const contextMessageType = String(contextMessage?.type || "").toLowerCase();
  const contextMessageIdKey = String(contextMessage?.messageId || "");
  const contextSourceContent = String(contextMessage?.content || "").trim();
  const contextCanCopy = contextMessageType === "text" || contextMessageType === "image";
  const contextCanDownload = contextMessageType === "image";
  const contextTargetLanguage = resolveTargetTranslationLanguage(
    contextSourceContent,
    language
  );
  const contextTranslation = contextMessageIdKey ? translations[contextMessageIdKey] : null;
  const contextCanTranslate =
    contextMessageType === "text" &&
    !!contextMessageIdKey &&
    !!contextSourceContent;
  const contextHasVisibleTranslation =
    contextCanTranslate &&
    contextTranslation?.visible &&
    contextTranslation?.targetLang === contextTargetLanguage &&
    contextTranslation?.sourceContent === contextSourceContent;

  const activeConversationIcon =
    conversationIconUrls[String(conversationId)] || "";

  const chatSidebarConversations = useMemo(() => {
    return [...conversations]
      .sort((a, b) => getConversationSortTime(b) - getConversationSortTime(a))
      .map((conv) => {
        const isGroup = conv.conversationType === "group";
        let title = conv.groupName || "Group Chat";

        if (!isGroup) {
          const participantIds = conv.participants || [];
          const names = conv.participantNames || [];
          const selfIndex = participantIds.findIndex(
            (participantId) => String(participantId) === String(currentUser?.id)
          );
          const otherIndex = participantIds.findIndex(
            (participantId) => String(participantId) !== String(currentUser?.id)
          );

          if (otherIndex !== -1 && names[otherIndex]) {
            title = names[otherIndex];
          } else if (selfIndex !== -1 && names.length > 1) {
            title = names.find((_, idx) => idx !== selfIndex) || i18n.t("privateChat");
          } else {
            title = i18n.t("privateChat");
          }
        }

        return {
          ...conv,
          sidebarTitle: title,
          sidebarPreview: getConversationPreview(conv, currentUser?.id),
        };
      });
  }, [conversations, currentUser?.id]);

  const filteredSidebarConversations = useMemo(() => {
    const query = String(sidebarSearchQuery || "").trim().toLowerCase();
    if (!query) return chatSidebarConversations;

    return chatSidebarConversations.filter((item) => {
      const title = String(item?.sidebarTitle || "").toLowerCase();
      const preview = String(item?.sidebarPreview || "").toLowerCase();
      return title.includes(query) || preview.includes(query);
    });
  }, [chatSidebarConversations, sidebarSearchQuery]);

  const filteredNewChatUsers = useMemo(() => {
    const query = String(newChatSearchQuery || "").trim().toLowerCase();
    if (!query) return newChatUsers;

    return newChatUsers.filter((item) => {
      const fullName = `${item?.firstName || ""} ${item?.lastName || ""}`.trim().toLowerCase();
      const email = String(item?.email || "").toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
  }, [newChatSearchQuery, newChatUsers]);

  const filteredNewGroupUsers = useMemo(() => {
    const query = String(newGroupSearchQuery || "").trim().toLowerCase();
    if (!query) return newChatUsers;

    return newChatUsers.filter((item) => {
      const fullName = `${item?.firstName || ""} ${item?.lastName || ""}`.trim().toLowerCase();
      const email = String(item?.email || "").toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
  }, [newGroupSearchQuery, newChatUsers]);

  const loadWebNewChatUsers = useCallback(async () => {
    try {
      setLoadingNewChatUsers(true);
      const allUsers = await getAllUsers();
      const resolvedUsers = await Promise.all(
        (allUsers || []).map(async (item) => ({
          ...item,
          profileImageUrl: await fetchViewingPresignedUrl(item?.profileImage, "profile"),
        }))
      );
      setNewChatUsers(
        resolvedUsers.filter((u) => String(u?.id) !== String(currentUser?.id))
      );
    } catch (error) {
      Alert.alert(i18n.t("error"), i18n.t("cantFetchUsers"), [{ text: i18n.t("ok") }]);
    } finally {
      setLoadingNewChatUsers(false);
    }
  }, [currentUser?.id]);

  const handleOpenWebNewChatPanel = async () => {
    if (!isWebDesktop) {
      navigation.navigate("NewChat");
      return;
    }

    setShowWebChatMenu(false);
    setShowWebNewChatPanel(true);
    setShowWebCreateGroupPanel(false);
    setNewChatSearchQuery("");
    await loadWebNewChatUsers();
  };

  const handleOpenWebCreateGroupPanel = async () => {
    setShowWebChatMenu(false);
    setShowWebCreateGroupPanel(true);
    setNewGroupName("");
    setNewGroupSearchQuery("");
    setNewGroupSelectedParticipants([]);
    setNewGroupImageUri(null);
    if (!newChatUsers.length) {
      await loadWebNewChatUsers();
    }
  };

  const handleToggleNewGroupParticipant = (userItem) => {
    setNewGroupSelectedParticipants((prev) => {
      const exists = prev.some((u) => String(u.id) === String(userItem.id));
      if (exists) {
        return prev.filter((u) => String(u.id) !== String(userItem.id));
      }
      return [...prev, userItem];
    });
  };

  const handlePickNewGroupImage = async () => {
    try {
      if (Platform.OS !== "web") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(i18n.t("error"), i18n.t("needPhotoAccess"), [{ text: i18n.t("ok") }]);
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setNewGroupImageUri(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert(i18n.t("error"), i18n.t("imageUploadFailed"), [{ text: i18n.t("ok") }]);
    }
  };

  const uploadNewGroupImageIfNeeded = async () => {
    if (!newGroupImageUri) return null;

    try {
      setUploadingNewGroupImage(true);
      const sanitizedGroupName = String(newGroupName || "group").replace(/[^a-zA-Z0-9]/g, "_");
      const timestamp = Date.now();
      const fileName = `group_${sanitizedGroupName}_${timestamp}.jpg`;
      const presignedUploadUrl = await getPresignedUploadUrl(fileName, "group");
      return await uploadFileToOSS(newGroupImageUri, presignedUploadUrl);
    } finally {
      setUploadingNewGroupImage(false);
    }
  };

  const handleCreateGroupFromSidebar = async () => {
    if (!String(newGroupName || "").trim() || !newGroupSelectedParticipants.length) {
      Alert.alert(i18n.t("error"), i18n.t("createGroupRequirement"), [{ text: i18n.t("ok") }]);
      return;
    }

    try {
      setCreatingNewGroup(true);
      const uploadedGroupIcon = await uploadNewGroupImageIfNeeded();

      const response = await startGroupChat({
        groupName: String(newGroupName || "").trim(),
        participants: newGroupSelectedParticipants.map((u) => u.id),
        conversationType: "group",
        groupIcon: uploadedGroupIcon,
      });

      const createdConversationId = response?.data?.conversationId;
      setShowWebCreateGroupPanel(false);
      setShowWebNewChatPanel(false);
      navigation.navigate("Chat", { conversationId: createdConversationId });
    } catch (error) {
      Alert.alert(i18n.t("error"), error?.message || i18n.t("createGroupFailed"), [
        { text: i18n.t("ok") },
      ]);
    } finally {
      setCreatingNewGroup(false);
    }
  };

  const handleStartPrivateChatFromSidebar = async (selectedUser) => {
    const existing = conversations.find(
      (c) =>
        c.conversationType === "private" &&
        (c.participants || []).includes(selectedUser.id)
    );

    if (existing) {
      setShowWebNewChatPanel(false);
      navigation.navigate("Chat", {
        conversationId: existing.conversationId,
      });
      return;
    }

    try {
      const response = await startPrivateChat([selectedUser.id]);
      setShowWebNewChatPanel(false);
      navigation.navigate("Chat", {
        conversationId: response?.data?.conversationId,
      });
    } catch (error) {
      Alert.alert(i18n.t("error"), i18n.t("unableStartPrivateChat"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  const chatContent = (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.headerTapArea}
          activeOpacity={canOpenChatDetails ? 0.72 : 1}
          onPress={handleOpenChatDetails}
          disabled={!canOpenChatDetails}
        >
          <Image
            source={activeConversationIcon ? { uri: activeConversationIcon } : defaultProfileImage}
            style={styles.profileImage}
          />
          <Text style={styles.chatHeader} numberOfLines={1}>
            {chatDisplayName}
          </Text>
          {canOpenChatDetails && (
            <Ionicons
              name="chevron-forward"
              size={15}
              color="#8E8E93"
              style={styles.chatHeaderChevron}
            />
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        inverted
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        onScrollBeginDrag={() => {
          closeContextMenu();
        }}
        keyExtractor={(item, index) =>
          item.type === "date"
            ? item.id
            : String(item.messageId || item.localId || item.clientMessageId || `msg-${index}`)
        }
        renderItem={({ item }) => {
          if (item.type === "date") {
            return (
              <View style={styles.dateSeparator}>
                <Text style={styles.dateText}>{item.date}</Text>
              </View>
            );
          }

          const isMe = item.senderId === currentUser?.id;
          const isFailed = item.failed;
          const isPending = item.pending;
          const messageType = (item.type || "").toLowerCase();
          const isVoice = messageType === "voice";
          const isImage = messageType === "image";
          const messageIdKey = String(item.messageId || "");
          const translationEntry = messageIdKey ? translations[messageIdKey] : null;
          const expectedTargetLanguage = resolveTargetTranslationLanguage(
            item.content,
            language
          );
          const outgoingDeliveryState = isMe
            ? resolveOutgoingDeliveryState(item.deliveryStatus, currentUser?.id)
            : null;
          const showOutgoingDeliveryState =
            isMe && !isPending && !isFailed && !!outgoingDeliveryState;
          const showTranslation =
            !!translationEntry?.visible &&
            translationEntry?.targetLang === expectedTargetLanguage &&
            translationEntry?.sourceContent === String(item.content || "").trim();

          return (
            <TouchableOpacity
              onLongPress={
                Platform.OS === "web" || isImage ? undefined : (event) => openContextMenu(item, event)
              }
              onPress={
                Platform.OS === "web" && !isImage ? (event) => openContextMenu(item, event) : undefined
              }
              activeOpacity={0.7}
              style={[
                styles.message,
                isVoice
                  ? (isMe ? styles.voiceMessageBubbleSent : styles.voiceMessageBubbleReceived)
                  : isImage
                    ? (isMe ? styles.imageMessageBubbleSent : styles.imageMessageBubbleReceived)
                    : (isMe ? styles.sentMessage : styles.receivedMessage),
                isVoice ? styles.voiceMessageBubble : null,
                isFailed ? styles.failedMessage : null,
              ]}
            >
              {isImage ? (
                <ImageWrapper message={item} isMe={isMe} />
              ) : isVoice ? (
                (() => {
                  const { audioUrl, duration } = parseVoiceContent(item.content);

                  return (
                    <View style={styles.voiceWrapper}>
                      <View
                        style={[
                          styles.voiceCard,
                          isMe ? styles.voiceCardSent : styles.voiceCardReceived,
                        ]}
                      >
                        <VoicePlayer
                          audioUrl={audioUrl}
                          duration={duration}
                          conversationId={conversationId}
                          isMe={isMe}
                        />
                      </View>
                    </View>
                  );
                })()
              ) : (
                <View style={styles.messageContentContainer}>
                  <Text
                    selectable
                    style={[
                      styles.content,
                      isMe ? styles.contentSent : styles.contentReceived,
                    ]}
                  >
                    {item.content}
                  </Text>

                  {showTranslation && (
                    <View style={styles.translationContainer}>
                      <View style={styles.translationDivider} />
                      <Text
                        style={[
                          styles.translatedText,
                          isMe ? styles.contentSent : styles.contentReceived,
                        ]}
                      >
                        {translationEntry.text}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              <Text
                style={[
                  styles.timestamp,
                  isImage ? styles.imageTimestamp : (isMe ? styles.timestampSent : styles.timestampReceived),
                  isVoice ? styles.voiceTimestamp : null,
                ]}
              >
                {formatTime(item)}
                {isMe && item.isEdited ? " • Edited" : ""}
                {isPending ? " • Sending..." : ""}
                {isFailed ? " • Failed" : ""}
              </Text>
              {showOutgoingDeliveryState && (
                <Text
                  style={[
                    styles.deliveryStatus,
                    isImage ? styles.imageTimestamp : styles.timestampSent,
                    isVoice ? styles.deliveryStatusVoice : null,
                    !isImage && outgoingDeliveryState === "seen" ? styles.deliveryStatusSeen : null,
                  ]}
                >
                  {formatDeliveryStateLabel(outgoingDeliveryState)}
                </Text>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <Modal transparent visible={contextMenu.visible} animationType="fade" onRequestClose={closeContextMenu}>
        <View style={styles.menuOverlay} pointerEvents="box-none">
          <Pressable style={styles.menuBackdrop} onPress={closeContextMenu} />
          <View
            style={[styles.contextMenu, { left: contextMenuPosition.left, top: contextMenuPosition.top }]}
            onLayout={(event) =>
              setContextMenuSize({
                width: event.nativeEvent.layout.width,
                height: event.nativeEvent.layout.height,
              })
            }
          >
            {contextCanCopy && (
              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={async () => {
                  const selected = contextMenu.message;
                  closeContextMenu();

                  try {
                    if (contextMessageType === "image") {
                      await copyImageMessage(selected);
                    } else {
                      await Clipboard.setStringAsync(selected?.content || "");
                    }

                    Alert.alert(i18n.t("success"), i18n.t("copied"));
                  } catch (error) {
                    Alert.alert(i18n.t("error"), i18n.t("somethingWentWrong"));
                  }
                }}
              >
                <Text style={styles.contextMenuItemText}>{i18n.t("copy")}</Text>
              </TouchableOpacity>
            )}

            {contextCanDownload && (
              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={async () => {
                  const selected = contextMenu.message;
                  closeContextMenu();

                  try {
                    await downloadImageMessage(selected);
                    Alert.alert(i18n.t("success"), i18n.t("saveImageSuccess"));
                  } catch (error) {
                    Alert.alert(
                      i18n.t("error"),
                      error?.message === "Media library permission denied"
                        ? i18n.t("needPhotoAccess")
                        : i18n.t("saveImageFailed")
                    );
                  }
                }}
              >
                <Text style={styles.contextMenuItemText}>{i18n.t("download")}</Text>
              </TouchableOpacity>
            )}

            {contextCanTranslate && (
              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => {
                  const selected = contextMenu.message;
                  closeContextMenu();
                  handleTranslate(selected);
                }}
                disabled={translatingId === contextMessageIdKey}
              >
                <Text style={styles.contextMenuItemText}>
                  {translatingId === contextMessageIdKey
                    ? i18n.t("translating")
                    : contextHasVisibleTranslation
                      ? i18n.t("hideTranslation")
                      : i18n.t("translate")}
                </Text>
              </TouchableOpacity>
            )}

            {contextMenu.message?.senderId === currentUser?.id &&
              (contextMenu.message?.type || "").toLowerCase() === "text" &&
              !contextMenu.message?.pending &&
              !isLocalOnlyMessage(contextMenu.message) && (
                <TouchableOpacity
                  style={styles.contextMenuItem}
                  onPress={() => beginEditMessage(contextMenu.message)}
                >
                  <Text style={styles.contextMenuItemText}>{i18n.t("edit")}</Text>

                </TouchableOpacity>
              )}

            {contextMenu.message?.senderId === currentUser?.id &&
              !contextMenu.message?.pending && (
                <TouchableOpacity
                  style={styles.contextMenuItem}
                  onPress={async () => {
                    const selected = contextMenu.message;
                    closeContextMenu();
                    const confirmed = await confirmAction({
                      title: i18n.t("delete"),
                      message: i18n.t("areYouSure"),
                      confirmText: i18n.t("delete"),
                      cancelText: i18n.t("cancel"),
                      destructive: true,
                    });
                    if (!confirmed) return;
                    await handleDeleteMessage(selected);
                  }}
                >
                  <Text
                    style={[
                      styles.contextMenuItemText,
                      styles.contextMenuDangerText,
                    ]}
                  >
                    {i18n.t("delete")}
                  </Text>
                </TouchableOpacity>
              )}
          </View>
        </View>
      </Modal>

      {editingMessage && (
        <View style={styles.editingBanner}>
          <Text style={{ fontSize: webFontSize(12), color: "#666" }}>Editing message...</Text>
          <TouchableOpacity
            onPress={() => {
              setEditingMessage(null);
              setInputText("");
            }}
          >
            <Text style={{ color: "red", fontSize: webFontSize(12) }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TouchableOpacity onPress={pickAndSendImage} style={styles.attachButton} activeOpacity={0.82}>
          <Ionicons name="image" size={23} color="#111111" />
        </TouchableOpacity>

        <View style={styles.inputPill}>
          <TextInput
            ref={textInputRef}
            value={inputText}
            onChangeText={setInputText}
            placeholder={i18n.t("typeMessage")}
            placeholderTextColor="#98989D"
            style={styles.inputField}
            multiline
          />

          <View style={styles.voiceRecorderWrap}>
            <VoiceRecorder
              onRecordingComplete={handleVoiceRecordingComplete}
              iconSize={24}
              iconColor="#1F1F22"
              buttonSize={38}
            />
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSendOrUpdate}
          disabled={isSendDisabled}
          style={[
            styles.sendButton,
            isSendDisabled ? styles.sendButtonDisabled : styles.sendButtonActive,
          ]}
          activeOpacity={0.86}
        >
          {isSendingText ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.sendButtonText}>{editingMessage ? "Update" : "Send"}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  const detailsSidebarTranslateX = detailsSidebarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [360, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      {isWebDesktop ? (
        <View style={styles.webLayoutContainer}>
          <View style={[styles.webSidebar, { width: webDesktopSidebarWidth }]}>
            {showWebCreateGroupPanel ? (
              <View style={styles.webNewChatPanel}>
                <View style={styles.webNewChatHeader}>
                  <TouchableOpacity
                    onPress={() => setShowWebCreateGroupPanel(false)}
                    style={styles.webNewChatBackButton}
                    activeOpacity={0.82}
                  >
                    <Ionicons name="arrow-back" size={20} color="#111827" />
                  </TouchableOpacity>
                  <Text style={styles.webNewChatTitle}>{i18n.t("createNewGroup")}</Text>
                </View>

                <View style={styles.webNewGroupFormWrap}>
                  <TextInput
                    value={newGroupName}
                    onChangeText={setNewGroupName}
                    placeholder={i18n.t("groupName")}
                    placeholderTextColor="#8B8F97"
                    style={styles.webNewGroupInput}
                  />

                  {uploadingNewGroupImage ? (
                    <View style={styles.webNewGroupImageLoading}>
                      <ActivityIndicator size="small" color="#0A84FF" />
                    </View>
                  ) : newGroupImageUri ? (
                    <Image source={{ uri: newGroupImageUri }} style={styles.webNewGroupImagePreview} />
                  ) : null}

                  <TouchableOpacity
                    style={styles.webNewGroupImageButton}
                    onPress={handlePickNewGroupImage}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.webNewGroupImageButtonText}>{i18n.t("pickGroupImage")}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.sidebarSearchInputWrap}>
                  <Ionicons
                    name="search"
                    size={16}
                    color="#8B8F97"
                    style={styles.sidebarSearchIcon}
                  />
                  <TextInput
                    value={newGroupSearchQuery}
                    onChangeText={setNewGroupSearchQuery}
                    placeholder={i18n.t("searchUsers")}
                    placeholderTextColor="#8B8F97"
                    style={styles.sidebarSearchInput}
                  />
                </View>

                <FlatList
                  data={filteredNewGroupUsers}
                  keyExtractor={(item) => String(item.id)}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.webNewChatListContent}
                  ItemSeparatorComponent={() => <View style={styles.sidebarConversationSeparator} />}
                  renderItem={({ item }) => {
                    const isSelected = newGroupSelectedParticipants.some(
                      (u) => String(u.id) === String(item.id)
                    );

                    return (
                      <TouchableOpacity
                        onPress={() => handleToggleNewGroupParticipant(item)}
                        style={[
                          styles.sidebarConversationItem,
                          isSelected ? styles.sidebarConversationItemActive : null,
                        ]}
                        activeOpacity={0.82}
                      >
                        <Image
                          source={
                            item?.profileImageUrl
                              ? { uri: item.profileImageUrl }
                              : defaultProfileImage
                          }
                          style={styles.sidebarAvatar}
                        />
                        <View style={styles.sidebarTextWrap}>
                          <Text style={styles.sidebarConversationTitle} numberOfLines={1}>
                            {`${item?.firstName || ""} ${item?.lastName || ""}`.trim() || i18n.t("unknownUser")}
                          </Text>
                          <Text style={styles.sidebarConversationPreview} numberOfLines={1}>
                            {item?.email || ""}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.webSelectBox,
                            isSelected ? styles.webSelectBoxChecked : null,
                          ]}
                        >
                          {isSelected ? <Text style={styles.webSelectBoxCheckmark}>✓</Text> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />

                <View style={styles.webNewChatFooter}>
                  <TouchableOpacity
                    style={styles.webNewGroupButton}
                    onPress={handleCreateGroupFromSidebar}
                    disabled={creatingNewGroup || uploadingNewGroupImage}
                    activeOpacity={0.9}
                  >
                    {creatingNewGroup ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.webNewGroupButtonText}>{i18n.t("createGroup")}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : showWebNewChatPanel ? (
              <View style={styles.webNewChatPanel}>
                <View style={styles.webNewChatHeader}>
                  <TouchableOpacity
                    onPress={() => setShowWebNewChatPanel(false)}
                    style={styles.webNewChatBackButton}
                    activeOpacity={0.82}
                  >
                    <Ionicons name="arrow-back" size={20} color="#111827" />
                  </TouchableOpacity>
                  <Text style={styles.webNewChatTitle}>{i18n.t("startNewChat")}</Text>
                </View>

                <View style={styles.sidebarSearchInputWrap}>
                  <Ionicons
                    name="search"
                    size={16}
                    color="#8B8F97"
                    style={styles.sidebarSearchIcon}
                  />
                  <TextInput
                    value={newChatSearchQuery}
                    onChangeText={setNewChatSearchQuery}
                    placeholder={i18n.t("searchUsers")}
                    placeholderTextColor="#8B8F97"
                    style={styles.sidebarSearchInput}
                  />
                </View>

                {loadingNewChatUsers ? (
                  <View style={styles.webNewChatLoadingWrap}>
                    <ActivityIndicator size="small" color="#0A84FF" />
                  </View>
                ) : (
                  <FlatList
                    data={filteredNewChatUsers}
                    keyExtractor={(item) => String(item.id)}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.webNewChatListContent}
                    ItemSeparatorComponent={() => <View style={styles.sidebarConversationSeparator} />}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        onPress={() => handleStartPrivateChatFromSidebar(item)}
                        style={styles.sidebarConversationItem}
                        activeOpacity={0.82}
                      >
                        <Image
                          source={
                            item?.profileImageUrl
                              ? { uri: item.profileImageUrl }
                              : defaultProfileImage
                          }
                          style={styles.sidebarAvatar}
                        />
                        <View style={styles.sidebarTextWrap}>
                          <Text style={styles.sidebarConversationTitle} numberOfLines={1}>
                            {`${item?.firstName || ""} ${item?.lastName || ""}`.trim() || i18n.t("unknownUser")}
                          </Text>
                          <Text style={styles.sidebarConversationPreview} numberOfLines={1}>
                            {item?.email || ""}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </View>
            ) : (
              <>
                <View style={styles.sidebarSearchInputWrap}>
                  <Ionicons
                    name="search"
                    size={16}
                    color="#8B8F97"
                    style={styles.sidebarSearchIcon}
                  />
                  <TextInput
                    value={sidebarSearchQuery}
                    onChangeText={setSidebarSearchQuery}
                    placeholder="Search"
                    placeholderTextColor="#8B8F97"
                    style={styles.sidebarSearchInput}
                  />
                </View>
                <FlatList
                  data={filteredSidebarConversations}
                  keyExtractor={(item) => String(item.conversationId)}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.sidebarConversationListContent}
                  ItemSeparatorComponent={() => <View style={styles.sidebarConversationSeparator} />}
                  renderItem={({ item }) => {
                    const isActive =
                      String(item.conversationId) === String(conversationId);

                    return (
                      <TouchableOpacity
                        onPress={() => {
                          if (isActive) return;
                          navigation.navigate("Chat", { conversationId: item.conversationId });
                        }}
                        style={[
                          styles.sidebarConversationItem,
                          isActive ? styles.sidebarConversationItemActive : null,
                        ]}
                      >
                        <Image
                          source={
                            conversationIconUrls[String(item.conversationId)]
                              ? { uri: conversationIconUrls[String(item.conversationId)] }
                              : defaultProfileImage
                          }
                          style={[
                            styles.sidebarAvatar,
                            isActive ? styles.sidebarAvatarActive : null,
                          ]}
                        />
                        <View style={styles.sidebarTextWrap}>
                          <Text
                            style={styles.sidebarConversationTitle}
                            numberOfLines={1}
                          >
                            {item.sidebarTitle}
                          </Text>
                          <Text
                            style={styles.sidebarConversationPreview}
                            numberOfLines={1}
                          >
                            {item.sidebarPreview}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />

                <TouchableOpacity
                  onPress={() => setShowWebChatMenu(!showWebChatMenu)}
                  style={styles.sidebarNewChatButton}
                  accessibilityRole="button"
                  accessibilityLabel={i18n.t("startNewChat")}
                  activeOpacity={0.88}
                >
                  <Ionicons name="add" size={28} color="#FFFFFF" />
                </TouchableOpacity>

                {showWebChatMenu && (
                  <View style={styles.webChatMenu}>
                    <TouchableOpacity
                      onPress={handleOpenWebNewChatPanel}
                      style={styles.webChatMenuOption}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="person" size={20} color="#0A84FF" />
                      <Text style={styles.webChatMenuOptionText}>{i18n.t("startNewChat")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleOpenWebCreateGroupPanel}
                      style={styles.webChatMenuOption}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="people" size={20} color="#0A84FF" />
                      <Text style={styles.webChatMenuOptionText}>{i18n.t("createNewGroup")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
          {showWebChatMenu && (
            <Pressable
              style={styles.webChatMenuBackdrop}
              onPress={() => setShowWebChatMenu(false)}
            />
          )}
          <View style={styles.webChatPane}>
            {chatContent}
          </View>
          {isDetailsPanelMounted && isWebDesktop && (
            <Animated.View
              style={[
                styles.webDetailsSidebar,
                { width: webDesktopSidebarWidth },
                { transform: [{ translateX: detailsSidebarTranslateX }] },
              ]}
            >
              <View style={styles.webDetailsSidebarHeader}>
                <TouchableOpacity
                  onPress={closeDetailsPanel}
                  style={styles.webDetailsCloseButton}
                  accessibilityRole="button"
                  accessibilityLabel={i18n.t("close")}
                >
                  <Ionicons name="close" size={22} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.webDetailsSidebarTitle} numberOfLines={1}>
                  {conversationType === "group"
                    ? i18n.t("detailedGroupChat")
                    : i18n.t("detailedPrivateChat")}
                </Text>
              </View>

              <View style={styles.webDetailsSidebarBody}>
                {conversationType === "group" ? (
                  <DetailedGroupChatPage
                    key={`web-group-${conversationId}`}
                    route={{
                      params: {
                        conversationId: Number.isFinite(Number(conversationId))
                          ? Number(conversationId)
                          : conversationId,
                      },
                    }}
                  />
                ) : (
                  <DetailedPrivateChatPage
                    key={`web-private-${privateChatParticipantId}`}
                    route={{
                      params: {
                        otherParticipantId: privateChatParticipantId,
                      },
                    }}
                  />
                )}
              </View>
            </Animated.View>
          )}
        </View>
      ) : (
        chatContent
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7", paddingBottom: 15 },
  webLayoutContainer: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#ECECEF",
  },
  webSidebar: {
    borderRightWidth: 1,
    borderColor: "#DDDEE4",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    position: "relative",
  },
  webNewChatPanel: {
    flex: 1,
  },
  webNewChatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  webNewChatBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  webNewChatTitle: {
    fontSize: webFontSize(16),
    fontWeight: "600",
    color: "#111827",
  },
  webNewChatLoadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  webNewGroupFormWrap: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  webNewGroupInput: {
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F2F3F7",
    borderWidth: 1,
    borderColor: "#E3E5EA",
    paddingHorizontal: 12,
    color: "#111827",
    fontSize: webFontSize(14),
    marginBottom: 8,
  },
  webNewGroupImageLoading: {
    alignItems: "center",
    justifyContent: "center",
    height: 70,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E3E5EA",
  },
  webNewGroupImagePreview: {
    width: 70,
    height: 70,
    borderRadius: 10,
    marginBottom: 8,
    alignSelf: "center",
  },
  webNewGroupImageButton: {
    backgroundColor: "#0A84FF",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  webNewGroupImageButtonText: {
    color: "#FFFFFF",
    fontSize: webFontSize(13),
    fontWeight: "600",
  },
  webNewChatListContent: {
    paddingBottom: 82,
  },
  webNewChatFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: "#EAECEF",
  },
  webNewGroupButton: {
    backgroundColor: "#0A84FF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  webNewGroupButtonText: {
    color: "#FFFFFF",
    fontSize: webFontSize(14),
    fontWeight: "600",
  },
  sidebarConversationListContent: {
    paddingBottom: 86,
  },
  sidebarSearchInputWrap: {
    paddingHorizontal: 10,
    paddingBottom: 8,
    position: "relative",
    justifyContent: "center",
  },
  sidebarSearchIcon: {
    position: "absolute",
    left: 22,
    zIndex: 1,
  },
  sidebarSearchInput: {
    height: 38,
    borderRadius: 10,
    backgroundColor: "#F2F3F7",
    borderWidth: 1,
    borderColor: "#E3E5EA",
    paddingLeft: 34,
    paddingRight: 12,
    color: "#111827",
    fontSize: webFontSize(14),
  },
  sidebarConversationItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 8,
    borderRadius: 12,
  },
  sidebarConversationSeparator: {
    height: 1,
    backgroundColor: "#EEF0F4",
    marginHorizontal: 16,
  },
  sidebarConversationItemActive: {
    backgroundColor: "#E8F2FF",
  },
  sidebarAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  sidebarAvatarActive: {
    borderWidth: 2,
    borderColor: "#A8CCFF",
  },
  sidebarTextWrap: {
    flex: 1,
  },
  sidebarConversationTitle: {
    fontSize: webFontSize(14),
    fontWeight: "600",
    color: "#111827",
  },
  sidebarConversationPreview: {
    marginTop: 2,
    fontSize: webFontSize(12),
    color: "#6B7280",
  },
  webSelectBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#C9CED8",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  webSelectBoxChecked: {
    backgroundColor: "#0A84FF",
    borderColor: "#0A84FF",
  },
  webSelectBoxCheckmark: {
    color: "#FFFFFF",
    fontSize: webFontSize(11),
    fontWeight: "700",
    lineHeight: webFontSize(11),
  },
  sidebarNewChatButton: {
    position: "absolute",
    right: 18,
    bottom: 18,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#0A84FF",
    alignItems: "center",
    justifyContent: "center",
  },
  webChatMenu: {
    position: "absolute",
    right: 18,
    bottom: 80,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
    overflow: "hidden",
  },
  webChatMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  webChatMenuOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#F0F0F0",
  },
  webChatMenuOption_last: {
    borderBottomWidth: 0,
  },
  webChatMenuOptionText: {
    marginLeft: 12,
    fontSize: webFontSize(14),
    fontWeight: "500",
    color: "#111827",
  },
  webChatPane: {
    flex: 3,
    backgroundColor: "#F2F2F7",
    paddingHorizontal: 100,
  },
  webDetailsSidebar: {
    borderLeftWidth: 1,
    borderColor: "#DDDEE4",
    backgroundColor: "#FFFFFF",
    flexDirection: "column",
  },
  webDetailsSidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#E9E9EB",
    backgroundColor: "#FFFFFF",
  },
  webDetailsCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    marginRight: 8,
  },
  webDetailsSidebarTitle: {
    fontSize: webFontSize(15),
    fontWeight: "600",
    color: "#111827",
    flexShrink: 1,
  },
  webDetailsSidebarBody: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  detailsContent: {
    flex: 1,
    paddingVertical: 12,
  },
  detailsSection: {
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  detailsProfileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  detailsGroupName: {
    fontSize: webFontSize(18),
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  detailsSeparator: {
    height: 1,
    backgroundColor: "#E9E9EB",
    marginHorizontal: 14,
  },
  detailsSectionTitle: {
    fontSize: webFontSize(14),
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  detailsMemberItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  detailsMemberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  detailsMemberInfo: {
    flex: 1,
  },
  detailsMemberName: {
    fontSize: webFontSize(14),
    fontWeight: "500",
    color: "#111827",
  },
  detailsMemberHandle: {
    fontSize: webFontSize(12),
    color: "#6B7280",
    marginTop: 2,
  },
  detailsUserBio: {
    fontSize: webFontSize(13),
    color: "#6B7280",
    marginBottom: 12,
    paddingHorizontal: 14,
  },
  detailsUserInfo: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  detailsLabel: {
    fontSize: webFontSize(12),
    fontWeight: "600",
    color: "#6B7280",
    marginRight: 8,
  },
  detailsValue: {
    fontSize: webFontSize(12),
    color: "#111827",
    flex: 1,
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderColor: "#EEE",
  },
  headerTapArea: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  profileImage: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  chatHeader: { fontSize: webFontSize(16), fontWeight: "600", flexShrink: 1 },
  chatHeaderChevron: {
    marginLeft: 4,
  },
  message: {
    marginVertical: 3,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: "82%",
  },
  sentMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#0A84FF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 6,
  },
  receivedMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#E9E9EB",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 20,
  },
  imageMessageBubbleSent: {
    alignSelf: "flex-end",
    padding: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    maxWidth: 230,
  },
  imageMessageBubbleReceived: {
    alignSelf: "flex-start",
    padding: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    maxWidth: 230,
  },
  chatImage: {
    width: 220,
    height: 220,
    borderRadius: 18,
  },
  chatImageSent: {
    borderWidth: 2,
    borderColor: "rgba(10,132,255,0.25)",
  },
  chatImageReceived: {
    borderWidth: 1,
    borderColor: "#D7D7DB",
  },
  failedMessage: {
    borderWidth: 1,
    borderColor: "#E35D5D",
  },
  content: {
    fontSize: webFontSize(16),
    lineHeight: Platform.OS === "web" ? 24 : 21,
  },
  contentSent: {
    color: "#FFFFFF",
  },
  contentReceived: {
    color: "#111113",
  },
  timestamp: {
    fontSize: webFontSize(10),
    alignSelf: "flex-end",
    marginTop: 4,
    letterSpacing: 0.1,
  },
  timestampSent: {
    color: "rgba(255,255,255,0.82)",
  },
  timestampReceived: {
    color: "rgba(60,60,67,0.62)",
  },
  imageTimestamp: {
    color: "rgba(60,60,67,0.62)",
    marginTop: 6,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 7,
    backgroundColor: "#F2F2F7",
    borderTopWidth: 1,
    borderColor: "#E1E1E6",
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7E7EA",
    marginRight: 7,
  },
  inputPill: {
    flex: 1,
    minHeight: 40,
    maxHeight: 104,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: "#E7E7EA",
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 2,
    overflow: "visible",
  },
  inputField: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? 7 : 6,
    paddingRight: 6,
    maxHeight: 92,
    fontSize: webFontSize(16),
    lineHeight: Platform.OS === "web" ? 23 : 20,
    textAlignVertical: "center",
    color: "#111113",
  },
  sendButton: {
    minWidth: 74,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginLeft: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonActive: {
    backgroundColor: "#0A84FF",
  },
  sendButtonDisabled: {
    backgroundColor: "#C4C8D0",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: webFontSize(15),
    fontWeight: "700",
  },
  editingBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 5,
    backgroundColor: "#EEE",
  },
  dateSeparator: { alignItems: "center", marginVertical: 12 },
  dateText: {
    fontSize: webFontSize(12),
    color: "#7A7A80",
    backgroundColor: "#E5E5EA",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  voiceRecorderWrap: {
    marginLeft: 3,
    alignSelf: "center",
  },
  voiceMessageBubble: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 0,
  },
  voiceMessageBubbleSent: {
    alignSelf: "flex-end",
    backgroundColor: "#0A84FF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 6,
  },
  voiceMessageBubbleReceived: {
    alignSelf: "flex-start",
    backgroundColor: "#E9E9EB",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 20,
  },
  voiceWrapper: {
    width: "100%",
    alignItems: "stretch",
    justifyContent: "center",
  },
  voiceCard: {
    width: "100%",
    minWidth: 228,
    maxWidth: 320,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
  },
  voiceCardSent: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderColor: "rgba(255,255,255,0.24)",
  },
  voiceCardReceived: {
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    borderColor: "rgba(141,141,147,0.2)",
  },
  voiceTimestamp: {
    alignSelf: "flex-end",
    marginTop: 6,
  },
  deliveryStatus: {
    fontSize: webFontSize(11),
    alignSelf: "flex-end",
    marginTop: 1,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  deliveryStatusSeen: {
    color: "rgba(255,255,255,0.98)",
  },
  deliveryStatusVoice: {
    marginTop: 2,
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  contextMenu: {
    position: "absolute",
    minWidth: 160,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  contextMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  contextMenuItemText: {
    fontSize: webFontSize(14),
    color: "#111827",
    fontWeight: "500",
  },
  contextMenuDangerText: {
    color: "#DC2626",
  },
  messageContentContainer: {
    width: "100%",
    minWidth: 80,
  },
  translationContainer: {
    marginTop: 8,
  },
  translationDivider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.1)",
    marginVertical: 4,
    width: '100%',
  },
  translatedText: {
    fontSize: webFontSize(15),
    fontStyle: "italic",
  },
});
