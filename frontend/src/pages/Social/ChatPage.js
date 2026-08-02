import { showAlert } from "../../utils/showAlert";
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
  Platform,
  Keyboard,
  useWindowDimensions,
  Animated,
  Easing,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import Reanimated, { useAnimatedStyle } from "react-native-reanimated";
import defaultProfileImage from "../../../assets/user.png";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import {
  MEDIA_LIBRARY_PERMISSION_DENIED,
  downloadImageToLibrary,
  saveImageToLibrary,
} from "../../utils/mediaLibrary";
import { isTranslationEnabled, translateText } from "../../service/TranslateService";
import { UserContext } from "../../context/UserContext";
import { ChatContext } from "../../context/ChatContext";
import { LanguageContext } from "../../context/LanguageContext";
import {
  sendMessageToDatabase,
  deleteMessageFromDatabase,
  editMessageInDatabase,
  getConversationMuteStatus,
  setConversationMuteStatus,
  markConversationRead,
} from "../../service/ChatService";
import {
  getLocalUri as getCachedMedia,
  peekLocalUri as peekCachedMedia,
} from "../../service/MediaCacheService";
// Keyboard controller gives Android a true keyboard-sticky composer under edge-to-edge.
import {
  KeyboardAvoidingView,
  KeyboardStickyView,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import {
  getConversationDownloadUrl,
  getConversationUploadUrl,
  getPresignedUploadUrl,
  resolvePresignedAssetUrl,
  uploadFileToOSS,
  deleteOwnUpload,
  deleteOwnConversationUpload,
} from "../../service/OSSService";
import { getStompClient } from "../../service/WebSocketService";
import { searchUsers, getUserById, startGroupChat, startPrivateChat } from "../../service/UserService";
import useDebouncedValue from "../../hooks/useDebouncedValue";
import { setActiveConversation, clearActiveConversation } from "../../utils/activeConversation";
import VoiceRecorder from "../../components/Chat/VoiceRecorder";
import VoicePlayer from "../../components/Chat/VoicePlayer";
import ImageViewer from "../../components/Chat/ImageViewer";
import DetailedPrivateChatPage from "./DetailedPrivateChatPage";
import DetailedGroupChatPage from "./DetailedGroupChatPage";
import { confirmAction } from "../../utils/confirmAction";
import { reportMessage } from "../../service/ReportService";
import { getBlockStatus, getBlockedIds } from "../../service/BlockService";

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

// Bounds a chat photo is drawn inside. Wide enough to read, short enough that one
// tall screenshot doesn't push the rest of the conversation off screen.
const IMAGE_BUBBLE_MAX_WIDTH = 240;
const IMAGE_BUBBLE_MAX_HEIGHT = 320;

/**
 * Largest box with the photo's own proportions that fits the bounds above, so
 * nothing is cropped. Replaces the fixed square, which cut the sides off
 * panoramas and the top and bottom off tall shots.
 */
const fitImageWithinBubble = (naturalWidth, naturalHeight) => {
  const ratio = naturalWidth / naturalHeight;
  let width = IMAGE_BUBBLE_MAX_WIDTH;
  let height = width / ratio;

  if (height > IMAGE_BUBBLE_MAX_HEIGHT) {
    height = IMAGE_BUBBLE_MAX_HEIGHT;
    width = height * ratio;
  }

  return { width: Math.round(width), height: Math.round(height) };
};

// Defined at module scope (NOT inside ChatPage) on purpose: a component declared
// inside another component is a brand-new type on every parent render, so React
// unmounts and remounts it each time — which makes every chat <Image> reload from
// the network (the "flashing" in conversation history). At module scope the type is
// stable, so loaded images survive the chat's frequent re-renders. React.memo skips
// re-rendering rows whose props are unchanged.
const ChatImage = React.memo(function ChatImage({
  message,
  isMe,
  resolveUri,
  onPress,
  onLongPress,
}) {
  // Source priority: the local file (sender's own freshly-sent image — instant and
  // survives the optimistic -> persisted swap), then the on-device media cache, then
  // the remote presigned URL. peekCachedMedia seeds the first render synchronously so
  // an already-cached image never flashes through a spinner.
  const [uri, setUri] = useState(
    () => message.localPreviewUri || peekCachedMedia(message.content) || null
  );
  const [displaySize, setDisplaySize] = useState(null);

  useEffect(() => {
    let active = true;
    if (message.localPreviewUri) {
      setUri(message.localPreviewUri);
      return () => {
        active = false;
      };
    }
    // Serve from the local cache (downloads once on a miss); fall back to the remote
    // presigned URL only if it couldn't be cached.
    getCachedMedia(message.content, resolveUri).then(async (local) => {
      if (!active) return;
      setUri(local || (await resolveUri(message.content)));
    });
    return () => {
      active = false;
    };
  }, [message.content, message.localPreviewUri, resolveUri]);

  // Sized from the photo's own proportions rather than a fixed square, so a tall
  // or panoramic shot is shown whole instead of centre-cropped. Until getSize
  // answers, styles.chatImage's square stands in.
  useEffect(() => {
    if (!uri) return undefined;
    let active = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (active && width > 0 && height > 0) setDisplaySize(fitImageWithinBubble(width, height));
      },
      // Unreadable dimensions just keep the fallback box.
      () => {}
    );
    return () => {
      active = false;
    };
  }, [uri]);

  if (!uri) {
    return <ActivityIndicator size="small" color={isMe ? "#FFFFFF" : "#0A84FF"} />;
  }

  return (
    // The long press lives here rather than on the surrounding bubble: this
    // Touchable claims the touch first, so a handler on the parent would never
    // fire for a press that lands on the photo.
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={() => onPress(message, uri)}
      onLongPress={onLongPress ? (event) => onLongPress(message, event) : undefined}
      delayLongPress={300}
    >
      <Image
        source={{ uri }}
        style={[
          styles.chatImage,
          displaySize,
          isMe ? styles.chatImageSent : styles.chatImageReceived,
        ]}
      />
      {message.pending ? (
        <View style={styles.imageUploadOverlay}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
});

const ChatNativeHeaderTitle = React.memo(function ChatNativeHeaderTitle({
  iconUri,
  title,
  canOpen,
  onPress,
}) {
  return (
    <TouchableOpacity
      style={styles.nativeHeaderTitle}
      activeOpacity={canOpen ? 0.72 : 1}
      onPress={onPress}
      disabled={!canOpen}
    >
      <Image
        source={iconUri ? { uri: iconUri } : defaultProfileImage}
        style={styles.nativeHeaderAvatar}
      />
      <Text style={styles.nativeHeaderText} numberOfLines={1}>
        {title || i18n.t("chat")}
      </Text>
      {canOpen ? (
        <Ionicons
          name="chevron-forward"
          size={15}
          color="#8E8E93"
          style={styles.nativeHeaderChevron}
        />
      ) : null}
    </TouchableOpacity>
  );
});

const AndroidKeyboardListSpacer = React.memo(function AndroidKeyboardListSpacer() {
  const { height } = useReanimatedKeyboardAnimation();
  const spacerStyle = useAnimatedStyle(() => ({
    height: Math.max(0, -height.value),
  }));

  return <Reanimated.View pointerEvents="none" style={spacerStyle} />;
});

export default function ChatPage({ route }) {
  const conversationId = route?.params?.conversationId ?? route?.params?.id ?? null;

  const { user: currentUser } = useContext(UserContext);
  const { conversations, setConversations, setConversationMuted, loadOlderMessages } =
    useContext(ChatContext);
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();

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
  // Mirror of the presigned-URL cache so the resolver below can read the latest cache
  // while keeping a stable identity (deps: [conversationId]) — otherwise its identity
  // would change every time the cache fills and re-render every image row.
  const imagePresignedUrlsRef = useRef(imagePresignedUrls);
  useEffect(() => {
    imagePresignedUrlsRef.current = imagePresignedUrls;
  }, [imagePresignedUrls]);
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
  // Tapping a photo opens it full screen. The resolved uri is carried alongside
  // the message because ChatImage may be showing a local or cached file rather
  // than message.content, and the viewer should show exactly what the bubble did.
  const [imageViewer, setImageViewer] = useState({ visible: false, message: null, uri: null });
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && windowWidth >= 1024;
  const webDesktopSidebarWidth = windowWidth > 1600 ? 600 : windowWidth > 1400 ? 400 : 300;

  const [translations, setTranslations] = useState({});
  const [translatingId, setTranslatingId] = useState(null);
  const flatListRef = useRef(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showJumpToEnd, setShowJumpToEnd] = useState(false);
  // Tracks the conversation we've already positioned at its oldest unread, so the
  // one-time "open at oldest unread" jump runs once per conversation open.
  const anchorHandledRef = useRef(null);
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
      showAlert(i18n.t("error"), i18n.t("translationFailed"));
    } finally {
      setTranslatingId(null);
    }
  };

  useEffect(() => {
    const buildUsersDirectory = async () => {
      try {
        // Build the avatar directory from conversation participants rather than the
        // global roster — no email exposure, bounded to people you actually chat with.
        const profilesById = {};
        (conversations || []).forEach((conv) =>
          (conv?.participantProfiles || []).forEach((p) => {
            if (p?.id !== null && p?.id !== undefined) profilesById[String(p.id)] = p;
          })
        );

        const resolvedUsers = await Promise.all(
          Object.values(profilesById).map(async (item) => ({
            ...item,
            profileImageUrl: await fetchViewingPresignedUrl(item?.profileImage, "profile"),
          }))
        );

        const nextDirectory = {};
        resolvedUsers.forEach((item) => {
          nextDirectory[String(item.id)] = item;
        });

        setUserDirectory(nextDirectory);
      } catch (error) {
        console.error("Failed to build users directory for chat icons:", error);
      }
    };

    buildUsersDirectory();
  }, [conversations]);

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
            fullName: formatName(u.firstName, u.lastName),
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

  const fetchViewingPresignedUrl = async (imageUrl, type, mediaConversationId) => {
    return resolvePresignedAssetUrl(imageUrl, type, {
      conversationId: mediaConversationId,
    });
  };

  useEffect(() => {
    const loadConversationIcons = async () => {
      const nextIcons = {};

      await Promise.all(
        (conversations || []).map(async (conv) => {
          let iconUrl = null;

          if (conv?.conversationType === "group") {
            iconUrl = await fetchViewingPresignedUrl(
              conv?.groupIcon,
              "group",
              conv?.conversationId
            );
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

  // --- user blocking ---------------------------------------------------------
  // Private chats: refresh the block relationship every time the screen gains
  // focus (so blocking/unblocking on the detail page mutes/unmutes on return).
  // Messaging stays muted while a block exists in EITHER direction.
  const [blockStatus, setBlockStatus] = useState(null);
  const messagingBlocked =
    conversationType === "private" && blockStatus?.canMessage === false;

  const refreshBlockStatus = useCallback(() => {
    if (conversationType !== "private" || privateChatParticipantId === null) {
      setBlockStatus(null);
      return;
    }
    getBlockStatus(privateChatParticipantId)
      .then(setBlockStatus)
      .catch(() => setBlockStatus(null)); // fail open — server still enforces
  }, [conversationType, privateChatParticipantId]);

  useFocusEffect(
    useCallback(() => {
      refreshBlockStatus();
    }, [refreshBlockStatus])
  );

  // Report the on-screen conversation while this screen is focused, so the
  // foreground notification handler (App.js) silences pushes for it.
  useFocusEffect(
    useCallback(() => {
      setActiveConversation(conversationId);
      return clearActiveConversation;
    }, [conversationId])
  );

  // --- per-conversation notification mute -----------------------------------
  // Muting only silences push notifications for THIS conversation (filtered
  // server-side); messages, unread badges and other conversations are unaffected.
  const [muted, setMuted] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  // Anchor the header dropdown to the actual header button. useHeaderHeight() doesn't
  // reliably share the Modal overlay's window-coordinate origin (the overlay uses raw
  // pageY like the context menu), so we measure the button in window space instead of
  // guessing from the header height — otherwise the menu drifts down-screen.
  const headerMenuButtonRef = useRef(null);
  const [headerMenuTop, setHeaderMenuTop] = useState(null);

  const openHeaderMenu = useCallback(() => {
    const node = headerMenuButtonRef.current;
    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow((x, y, width, height) => {
        if (typeof y === "number" && typeof height === "number") {
          setHeaderMenuTop(y + height + 4);
        }
      });
    }
    setShowHeaderMenu((prev) => !prev);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMuted(false);
    setShowHeaderMenu(false);
    if (!conversationId || !conversationType) return undefined;
    getConversationMuteStatus(conversationId, conversationType)
      .then((res) => {
        if (!cancelled) setMuted(Boolean(res?.muted));
      })
      .catch(() => {}); // show as unmuted; the server keeps the truth
    return () => {
      cancelled = true;
    };
  }, [conversationId, conversationType]);

  const toggleMuteNotifications = useCallback(async () => {
    setShowHeaderMenu(false);
    const next = !muted;
    setMuted(next); // optimistic — reverted on failure
    // Muted conversations drop out of the app-wide badge, so the shared list has
    // to learn about the change too, not just this screen's local state.
    setConversationMuted(conversationId, next);
    try {
      await setConversationMuteStatus(conversationId, conversationType, next);
    } catch (error) {
      setMuted(!next);
      setConversationMuted(conversationId, !next);
      showAlert(i18n.t("error"), i18n.t("muteUpdateFailed"));
    }
  }, [muted, conversationId, conversationType, setConversationMuted]);

  // Web two-pane: the user-detail panel is embedded (no focus change), so also
  // re-check when the details panel closes — that's where Block/Unblock lives.
  useEffect(() => {
    if (!showDetailsPanel) refreshBlockStatus();
  }, [showDetailsPanel, refreshBlockStatus]);

  // Group chats: a one-off heads-up per conversation when the group contains
  // someone the user has blocked (group messaging itself is unaffected).
  const blockedGroupNoticeRef = useRef(new Set());
  useEffect(() => {
    if (conversationType !== "group" || !conversationId) return;
    const key = String(conversationId);
    if (blockedGroupNoticeRef.current.has(key)) return;

    const checkBlockedMembers = async () => {
      try {
        const blockedIds = await getBlockedIds();
        if (!blockedIds.length) return;
        const memberIds = (conversation?.participants || []).map((p) => Number(p));
        if (memberIds.some((id) => blockedIds.includes(id))) {
          blockedGroupNoticeRef.current.add(key);
          showAlert(i18n.t("notice"), i18n.t("groupContainsBlocked"), [
            { text: i18n.t("ok") },
          ]);
        }
      } catch (error) {
        // Best-effort notice only.
      }
    };

    checkBlockedMembers();
  }, [conversationType, conversationId, conversation?.participants]);

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

  const handleOpenChatDetails = useCallback(() => {
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
  }, [
    conversationId,
    conversationType,
    isWebDesktop,
    navigation,
    openDetailsPanel,
    privateChatParticipantId,
  ]);

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

  const openImageViewer = useCallback((message, resolvedUri) => {
    if (!resolvedUri) return;
    setImageViewer({ visible: true, message, uri: resolvedUri });
  }, []);

  const closeImageViewer = useCallback(() => {
    setImageViewer({ visible: false, message: null, uri: null });
  }, []);

  // Shared by the context menu and the full-screen photo view so the two cannot
  // drift — reporting also has to shadow-hide the message locally, which is more
  // than a single service call.
  const submitReport = useCallback(
    async (selected) => {
      if (!selected?.messageId) return;
      try {
        await reportMessage(selected.messageId);
        // Shadow-hide immediately for the reporter; other viewers pick the flag
        // up from the server on their next history fetch.
        setConversations((prev) =>
          prev.map((conv) =>
            conv.conversationId === conversationId
              ? {
                  ...conv,
                  chatHistory: (conv.chatHistory || []).map((msg) =>
                    msg.messageId === selected.messageId ? { ...msg, reported: true } : msg
                  ),
                }
              : conv
          )
        );
        showAlert(i18n.t("success"), i18n.t("reportSuccessMessage"));
      } catch (error) {
        if (error?.response?.status === 409) {
          showAlert(i18n.t("error"), i18n.t("alreadyReported"));
        } else {
          showAlert(i18n.t("error"), i18n.t("reportFailed"));
        }
      }
    },
    [conversationId, setConversations]
  );

  const openContextMenu = useCallback(
    (message, event) => {
      const pageX = event?.nativeEvent?.pageX;
      const pageY = event?.nativeEvent?.pageY;

      setContextMenu({
        visible: true,
        x: typeof pageX === "number" ? pageX : windowWidth / 2,
        y: typeof pageY === "number" ? pageY : windowHeight / 2,
        message,
      });
    },
    [windowWidth, windowHeight]
  );

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

  // Inverted list: onEndReached fires at the top (oldest), so auto-load older history.
  const handleLoadOlder = useCallback(async () => {
    if (
      loadingOlder ||
      !conversation?.hasMoreHistory ||
      conversation?.oldestCursor == null
    ) {
      return;
    }
    setLoadingOlder(true);
    try {
      await loadOlderMessages(
        conversation.conversationId,
        conversation.conversationType,
        conversation.oldestCursor
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, conversation, loadOlderMessages]);

  // Inverted list: contentOffset.y grows as you scroll UP (away from newest at the
  // bottom). Show the "jump to latest" button once the user is meaningfully scrolled up.
  const handleListScroll = useCallback((e) => {
    setShowJumpToEnd(e.nativeEvent.contentOffset.y > 200);
  }, []);

  const jumpToEnd = useCallback(() => {
    setShowJumpToEnd(false);
    // Inverted list: offset 0 is the newest message (bottom).
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  // scrollToIndex can fail if the target isn't rendered yet (long/variable-height
  // list); retry shortly after, by which point more rows have mounted.
  const handleScrollToIndexFailed = useCallback((info) => {
    setTimeout(() => {
      try {
        flatListRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: false });
      } catch (_) {
        // give up silently — the user stays at the bottom (default)
      }
    }, 250);
  }, []);

  // Open a conversation positioned at its OLDEST UNREAD message instead of the bottom.
  // Runs once per conversation open, before the read-marking effect clears unread state.
  // Respects the sliding window: it targets the oldest unread that is currently loaded
  // (for very large unread counts the older ones page in as the user scrolls up).
  useEffect(() => {
    if (!conversation || anchorHandledRef.current === conversationId) return;
    const history = conversation.chatHistory || [];
    if (!history.length) return; // wait until the first page of messages is present
    anchorHandledRef.current = conversationId; // handle once per open

    if (!(conversation.unreadCount > 0)) return; // nothing unread -> default to bottom

    const oldestUnread = [...history].sort(sortByTimeAscending).find(
      (m) =>
        String(m.senderId) !== String(currentUser?.id) &&
        String(m.deliveryStatus?.[currentUser?.id] || "").toUpperCase() !== "READ" &&
        !isLocalOnlyMessage(m)
    );
    if (!oldestUnread) return;

    const idx = messages.findIndex(
      (it) => it.type !== "date" && String(it.messageId) === String(oldestUnread.messageId)
    );
    if (idx < 0) return;

    // Defer until after mount; onScrollToIndexFailed retries if the row isn't ready.
    requestAnimationFrame(() => {
      try {
        flatListRef.current?.scrollToIndex({ index: idx, viewPosition: 0.5, animated: false });
        setShowJumpToEnd(true);
      } catch (_) {
        // handled by onScrollToIndexFailed
      }
    });
  }, [conversation?.chatHistory, conversation?.unreadCount, conversationId, currentUser?.id, messages]);

  // Opening a conversation reads all of it, not just the page on screen. The
  // per-message receipts below can only speak for messages the client has loaded,
  // so without this one call everything older stays unread on the server and the
  // badge comes back the next time the conversation list refreshes.
  useEffect(() => {
    if (!currentUser?.id || !conversationId || !conversationType) return;
    markConversationRead(conversationId, conversationType);
  }, [conversationId, conversationType, currentUser?.id]);

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

    // Viewing the conversation clears its unread badge (incremented live on receipt).
    if (conversation?.unreadCount) {
      setConversations((prev) =>
        prev.map((c) =>
          Number(c.conversationId) === Number(conversationId)
            ? { ...c, unreadCount: 0 }
            : c
        )
      );
    }
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
    if (messagingBlocked) return;
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
        showAlert(
          i18n.t("error"),
          error?.response?.status === 409
            ? i18n.t("contentUnderReview")
            : i18n.t("editMessageFailed")
        );
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
      showAlert("Error", "Message failed to send");
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
      showAlert("Error", "Could not delete message");
    }
  };

  const beginEditMessage = (message) => {
    setEditingMessage(message);
    setInputText(message.content || "");
    closeContextMenu();
    textInputRef.current?.focus();
  };

  const resolveImageUrl = useCallback(
    async (objectKey) => {
      if (!objectKey) return null;
      const cached = imagePresignedUrlsRef.current[objectKey];
      if (cached) return cached;

      try {
        const fileName = objectKey.split("/").pop();
        const presignedUrl = await getConversationDownloadUrl(fileName, conversationId);
        setImagePresignedUrls((prev) => ({ ...prev, [objectKey]: presignedUrl }));
        return presignedUrl;
      } catch (error) {
        return null;
      }
    },
    [conversationId]
  );

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

    if (String(uri).startsWith("file://")) {
      await saveImageToLibrary(uri);
      return;
    }

    await downloadImageToLibrary(uri, fileName);
  };

  // (chat image rendering lives in the module-level <ChatImage> component above)

  const pickAndSendImage = async () => {
    if (messagingBlocked) return;
    if (!currentUser?.id || !conversationId || !conversationType) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
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

    let uploadedUrl = null;
    try {
      const fileName = `chat_${Date.now()}.jpg`;
      const uploadUrl = await getConversationUploadUrl(fileName, conversationId);
      uploadedUrl = await uploadFileToOSS(imageUri, uploadUrl);

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
      if (uploadedUrl) {
        try {
          await deleteOwnConversationUpload(uploadedUrl, conversationId);
        } catch (cleanupError) {
          if (cleanupError?.response?.status !== 409) {
            console.warn("Failed to clean up unreferenced chat image:", cleanupError);
          }
        }
      }
      updateConversationHistory((history) =>
        history.map((msg) => (msg.localId === localId ? { ...msg, pending: false, failed: true } : msg))
      );
      clearAckTimeout(localId);
      showAlert("Error", "Image failed to send");
    }
  };

  const handleVoiceRecordingComplete = async (audioUri, duration) => {
    if (messagingBlocked) return;
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

    let uploadedUrl = null;
    try {
      const { contentType: voiceContentType, fileExtension: voiceFileExtension } = getVoiceUploadConfig(audioUri);
      const fileName = `voice_${conversationId}_${Date.now()}.${voiceFileExtension}`;
      const uploadUrl = await getConversationUploadUrl(fileName, conversationId, voiceContentType);
      uploadedUrl = await uploadFileToOSS(audioUri, uploadUrl, voiceContentType);
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
      if (uploadedUrl) {
        try {
          await deleteOwnConversationUpload(uploadedUrl, conversationId);
        } catch (cleanupError) {
          if (cleanupError?.response?.status !== 409) {
            console.warn("Failed to clean up unreferenced voice upload:", cleanupError);
          }
        }
      }
      updateConversationHistory((history) =>
        history.map((msg) => (msg.localId === localId ? { ...msg, pending: false, failed: true } : msg))
      );
      clearAckTimeout(localId);
      showAlert("Error", `Voice message failed to send.\n${error?.message || "Unknown upload error."}`);
    } finally {
      sendingVoiceLockRef.current = false;
    }
  };

  const isSendDisabled =
    messagingBlocked ||
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
    isTranslationEnabled &&
    contextMessageType === "text" &&
    !!contextMessageIdKey &&
    !!contextSourceContent;
  const contextHasVisibleTranslation =
    contextCanTranslate &&
    contextTranslation?.visible &&
    contextTranslation?.targetLang === contextTargetLanguage &&
    contextTranslation?.sourceContent === contextSourceContent;
  // Any real (delivered, server-persisted) message from ANOTHER user can be
  // reported — text, image, and voice alike.
  const contextCanReport =
    !!contextMessage &&
    contextMessage.senderId !== currentUser?.id &&
    !contextMessage.pending &&
    !contextMessage.failed &&
    !isLocalOnlyMessage(contextMessage);

  // Actions offered along the bottom of the full-screen photo. Same operations the
  // context menu exposes for an image, minus edit and translate, which are text-only.
  const imageViewerActions = useMemo(() => {
    const target = imageViewer.message;
    if (!target) return [];

    const isOwn = target.senderId === currentUser?.id;
    const items = [];

    items.push({
      key: "copy",
      icon: "copy-outline",
      label: i18n.t("copy"),
      onPress: async () => {
        closeImageViewer();
        try {
          await copyImageMessage(target);
          showAlert(i18n.t("success"), i18n.t("copied"));
        } catch {
          showAlert(i18n.t("error"), i18n.t("copyFailed"));
        }
      },
    });

    items.push({
      key: "download",
      icon: "download-outline",
      label: i18n.t("download"),
      onPress: async () => {
        closeImageViewer();
        try {
          await downloadImageMessage(target);
          showAlert(i18n.t("success"), i18n.t("saveImageSuccess"));
        } catch (error) {
          showAlert(
            i18n.t("error"),
            error?.message === MEDIA_LIBRARY_PERMISSION_DENIED
              ? i18n.t("needPhotoAccess")
              : i18n.t("saveImageFailed")
          );
        }
      },
    });

    if (isOwn && !target.pending) {
      items.push({
        key: "delete",
        icon: "trash-outline",
        label: i18n.t("delete"),
        destructive: true,
        onPress: async () => {
          closeImageViewer();
          const confirmed = await confirmAction({
            title: i18n.t("delete"),
            message: i18n.t("areYouSure"),
            confirmText: i18n.t("delete"),
            cancelText: i18n.t("cancel"),
            destructive: true,
          });
          if (!confirmed) return;
          await handleDeleteMessage(target);
        },
      });
    }

    // Report is deliberately absent: it fires immediately with no confirmation,
    // and a mis-tap in a full-screen view is far too easy. It stays on the
    // long-press menu, which takes a deliberate gesture to reach.

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageViewer.message, currentUser?.id, language]);

  const activeConversationIcon =
    conversationIconUrls[String(conversationId)] || "";

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <ChatNativeHeaderTitle
          iconUri={activeConversationIcon}
          title={chatDisplayName}
          canOpen={canOpenChatDetails}
          onPress={handleOpenChatDetails}
        />
      ),
      // Settings dropdown (mute notifications, ...) for the open conversation.
      headerRight: conversationId
        ? () => (
            <TouchableOpacity
              ref={headerMenuButtonRef}
              onPress={openHeaderMenu}
              style={styles.headerMenuButton}
              accessibilityRole="button"
              accessibilityLabel={i18n.t(muted ? "unmuteNotifications" : "muteNotifications")}
            >
              <Ionicons
                name={muted ? "notifications-off-outline" : "ellipsis-vertical"}
                size={21}
                color="#111827"
              />
            </TouchableOpacity>
          )
        : undefined,
      headerBackButtonDisplayMode: "minimal",
      headerBackTitle: "",
    });
  }, [
    activeConversationIcon,
    canOpenChatDetails,
    chatDisplayName,
    conversationId,
    handleOpenChatDetails,
    language,
    muted,
    navigation,
  ]);

  const chatSidebarConversations = useMemo(() => {
    return [...conversations]
      .sort((a, b) => getConversationSortTime(b) - getConversationSortTime(a))
      .map((conv) => {
        const isGroup = conv.conversationType === "group";
        let title = conv.groupName || "Group Chat";

        if (!isGroup) {
          const participantIds = conv.participants || [];
          const names = conv.participantNames || [];
          const profiles = conv.participantProfiles || [];
          // Prefer raw name components so the title honours the display-language
          // order (Chinese = family name first); fall back to the combined name.
          const nameAt = (idx) =>
            formatName(profiles[idx]?.firstName, profiles[idx]?.lastName) || names[idx];
          const selfIndex = participantIds.findIndex(
            (participantId) => String(participantId) === String(currentUser?.id)
          );
          const otherIndex = participantIds.findIndex(
            (participantId) => String(participantId) !== String(currentUser?.id)
          );

          if (otherIndex !== -1 && nameAt(otherIndex)) {
            title = nameAt(otherIndex);
          } else if (selfIndex !== -1 && names.length > 1) {
            const otherIdx = participantIds.findIndex((_, idx) => idx !== selfIndex);
            title = (otherIdx !== -1 && nameAt(otherIdx)) || i18n.t("privateChat");
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

  const loadWebNewChatUsers = useCallback(async (term = "") => {
    try {
      setLoadingNewChatUsers(true);
      // Server-side directory search (no email, capped page) instead of the whole roster.
      const res = await searchUsers(term, 0, 50);
      const resolvedUsers = await Promise.all(
        (res?.data || []).map(async (item) => ({
          ...item,
          profileImageUrl: await fetchViewingPresignedUrl(item?.profileImage, "profile"),
        }))
      );
      // Same rule as useUserSearch: chat is verified-only, and an explicit false
      // is what hides a row so an older server's payload still lists everyone.
      setNewChatUsers(
        resolvedUsers.filter(
          (u) =>
            u?.verifiedUser !== false &&
            String(u?.id) !== String(currentUser?.id)
        )
      );
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("cantFetchUsers"), [{ text: i18n.t("ok") }]);
    } finally {
      setLoadingNewChatUsers(false);
    }
  }, [currentUser?.id]);

  // Re-run the directory search server-side when the user pauses typing (700ms),
  // for whichever web panel is open. Initial load happens in the open handlers.
  const debouncedNewChatQuery = useDebouncedValue(newChatSearchQuery, 700);
  useEffect(() => {
    if (showWebNewChatPanel) loadWebNewChatUsers(debouncedNewChatQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedNewChatQuery]);

  const debouncedNewGroupQuery = useDebouncedValue(newGroupSearchQuery, 700);
  useEffect(() => {
    if (showWebCreateGroupPanel) loadWebNewChatUsers(debouncedNewGroupQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedNewGroupQuery]);

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
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setNewGroupImageUri(result.assets[0].uri);
      }
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("imageUploadFailed"), [{ text: i18n.t("ok") }]);
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
      showAlert(i18n.t("error"), i18n.t("createGroupRequirement"), [{ text: i18n.t("ok") }]);
      return;
    }

    let uploadedGroupIcon = null;
    try {
      setCreatingNewGroup(true);
      uploadedGroupIcon = await uploadNewGroupImageIfNeeded();

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
      if (uploadedGroupIcon) {
        try {
          await deleteOwnUpload(uploadedGroupIcon, "group");
        } catch (cleanupError) {
          if (cleanupError?.response?.status !== 409) {
            console.warn("Failed to clean up unreferenced group icon:", cleanupError);
          }
        }
      }
      showAlert(i18n.t("error"), error?.message || i18n.t("createGroupFailed"), [
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
      showAlert(i18n.t("error"), i18n.t("unableStartPrivateChat"), [
        { text: i18n.t("ok") },
      ]);
    }
  };

  const composerContent = (
    <View style={styles.composerWrap}>
      {showJumpToEnd && (
        <TouchableOpacity
          style={styles.jumpToEndButton}
          onPress={jumpToEnd}
          activeOpacity={0.85}
          accessibilityLabel="Jump to latest messages"
        >
          <Ionicons name="chevron-down" size={24} color="#1F1F22" />
        </TouchableOpacity>
      )}

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

      {messagingBlocked && (
        <View style={styles.blockedBanner}>
          <Ionicons name="ban-outline" size={16} color="#8E8E93" />
          <Text style={styles.blockedBannerText}>{i18n.t("messagingBlockedNotice")}</Text>
        </View>
      )}

      <View style={[styles.inputContainer, messagingBlocked && styles.inputContainerBlocked]}>
        <TouchableOpacity
          onPress={pickAndSendImage}
          style={styles.attachButton}
          activeOpacity={0.82}
          disabled={messagingBlocked}
        >
          <Ionicons name="image" size={23} color={messagingBlocked ? "#B0B0B3" : "#111111"} />
        </TouchableOpacity>

        <View style={styles.inputPill}>
          <TextInput
            ref={textInputRef}
            value={inputText}
            onChangeText={setInputText}
            placeholder={messagingBlocked ? i18n.t("messagingBlockedPlaceholder") : i18n.t("typeMessage")}
            placeholderTextColor="#98989D"
            style={styles.inputField}
            multiline
            editable={!messagingBlocked}
          />

          <View
            style={styles.voiceRecorderWrap}
            pointerEvents={messagingBlocked ? "none" : "auto"}
          >
            <VoiceRecorder
              onRecordingComplete={handleVoiceRecordingComplete}
              iconSize={24}
              iconColor={messagingBlocked ? "#B0B0B3" : "#1F1F22"}
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
    </View>
  );

  const chatContent = (
    <KeyboardAvoidingView
      // iOS still needs padding avoidance with the native header offset. Android uses
      // KeyboardStickyView for the composer instead; page-level padding leaves large
      // stale gaps when Gboard or edge-to-edge insets report transient IME states.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        inverted
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        onScrollBeginDrag={() => {
          closeContextMenu();
        }}
        onScroll={handleListScroll}
        scrollEventThrottle={16}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        onEndReached={handleLoadOlder}
        onEndReachedThreshold={0.2}
        // In an inverted FlatList the header renders at the visual bottom, so
        // this spacer lifts the newest messages by the same distance as the composer.
        ListHeaderComponent={Platform.OS === "android" ? AndroidKeyboardListSpacer : null}
        ListFooterComponent={
          loadingOlder ? (
            <ActivityIndicator style={{ marginVertical: 12 }} color="#888" />
          ) : null
        }
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
          // Reported messages are shadow-hidden: everyone except the sender sees
          // a muted placeholder until an admin resolves the report.
          const isShadowHidden = !!item.reported && !isMe;
          const messageType = (item.type || "").toLowerCase();
          const isVoice = !isShadowHidden && messageType === "voice";
          const isImage = !isShadowHidden && messageType === "image";
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
              // Images handle their own long press inside <ChatImage>, but the
              // bubble has padding around the photo — catching it here too means a
              // press on the margin still opens the menu.
              onLongPress={
                Platform.OS === "web" || isShadowHidden
                  ? undefined
                  : (event) => openContextMenu(item, event)
              }
              onPress={
                Platform.OS === "web" && !isImage && !isShadowHidden
                  ? (event) => openContextMenu(item, event)
                  : undefined
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
              {isShadowHidden ? (
                <View style={styles.messageContentContainer}>
                  <Text style={styles.reportedPlaceholder}>
                    {i18n.t("reportedPendingReview")}
                  </Text>
                </View>
              ) : isImage ? (
                <ChatImage
                  message={item}
                  isMe={isMe}
                  resolveUri={resolveImageUrl}
                  onPress={openImageViewer}
                  onLongPress={
                    Platform.OS === "web" || isShadowHidden ? undefined : openContextMenu
                  }
                />
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

                    showAlert(i18n.t("success"), i18n.t("copied"));
                  } catch (error) {
                    showAlert(i18n.t("error"), i18n.t("copyFailed"));
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
                    showAlert(i18n.t("success"), i18n.t("saveImageSuccess"));
                  } catch (error) {
                    showAlert(
                      i18n.t("error"),
                      error?.message === MEDIA_LIBRARY_PERMISSION_DENIED
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

            {contextCanReport && (
              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => {
                  const selected = contextMenu.message;
                  closeContextMenu();
                  submitReport(selected);
                }}
              >
                <Text
                  style={[
                    styles.contextMenuItemText,
                    styles.contextMenuDangerText,
                  ]}
                >
                  {i18n.t("report")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <ImageViewer
        visible={imageViewer.visible}
        uri={imageViewer.uri}
        actions={imageViewerActions}
        onClose={closeImageViewer}
      />

      {Platform.OS === "android" ? (
        <KeyboardStickyView>{composerContent}</KeyboardStickyView>
      ) : (
        composerContent
      )}
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
                            {formatName(item?.firstName, item?.lastName) || i18n.t("unknownUser")}
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
                            {formatName(item?.firstName, item?.lastName) || i18n.t("unknownUser")}
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

      <Modal
        transparent
        visible={showHeaderMenu}
        animationType="fade"
        onRequestClose={() => setShowHeaderMenu(false)}
      >
        <View style={styles.menuOverlay} pointerEvents="box-none">
          <Pressable style={styles.menuBackdrop} onPress={() => setShowHeaderMenu(false)} />
          <View style={[styles.headerMenu, { top: headerMenuTop ?? (headerHeight || 56) + 4 }]}>
            <TouchableOpacity style={styles.contextMenuItem} onPress={toggleMuteNotifications}>
              <View style={styles.headerMenuItemRow}>
                <Ionicons
                  name={muted ? "notifications-outline" : "notifications-off-outline"}
                  size={18}
                  color="#111827"
                />
                <Text style={styles.headerMenuItemText}>
                  {muted ? i18n.t("unmuteNotifications") : i18n.t("muteNotifications")}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    paddingBottom: Platform.OS === "android" ? 0 : 15,
  },
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
    ...StyleSheet.absoluteFill,
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
  nativeHeaderTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    maxWidth: Platform.OS === "web" ? 420 : 240,
  },
  nativeHeaderAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
  },
  nativeHeaderText: {
    fontSize: webFontSize(16),
    fontWeight: "600",
    color: "#111111",
    flexShrink: 1,
  },
  nativeHeaderChevron: {
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
  // Dim + spinner shown over a photo while it is still uploading.
  imageUploadOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 18,
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
  reportedPlaceholder: {
    fontSize: webFontSize(15),
    lineHeight: Platform.OS === "web" ? 22 : 20,
    fontStyle: "italic",
    color: "#8A8A8E",
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
  composerWrap: {
    position: "relative",
    overflow: "visible",
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
  inputContainerBlocked: {
    opacity: 0.55,
  },
  blockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#ECECEF",
    borderTopWidth: 1,
    borderColor: "#E1E1E6",
  },
  blockedBannerText: {
    fontSize: 12,
    color: "#8E8E93",
    flexShrink: 1,
  },
  // Floating "jump to latest" button, sits just above the input bar, bottom-right.
  jumpToEndButton: {
    position: "absolute",
    right: 16,
    bottom: 78,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E1E1E6",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
    zIndex: 10,
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
    ...StyleSheet.absoluteFill,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFill,
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
  headerMenuButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerMenu: {
    position: "absolute",
    right: 10,
    minWidth: 200,
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
  headerMenuItemRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerMenuItemText: {
    marginLeft: 10,
    fontSize: webFontSize(14),
    color: "#111827",
    fontWeight: "500",
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
