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
  BackHandler,
  Modal,
  Pressable,
  Platform,
  Keyboard,
  ScrollView,
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
// The assistant has no stored avatar; it wears the app's own icon.
import appIcon from "../../../assets/icon.png";
import CachedImage from "../../components/CachedImage";
import i18n from "../../../i18n";
import { formatName } from "../../utils/formatName";
import {
  compareConversations,
  groupDisplayName,
} from "../../utils/conversationDisplay";
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
  toggleReaction,
  getReactionUsers,
  pinGroupNotice,
  unpinGroupNotice,
  getGroupNoticeReaders,
  votePoll,
  addPollEntry,
  removePollEntry,
  closePoll,
  getPollVoters,
} from "../../service/ChatService";
import GroupNoticeBanner from "../../components/Chat/GroupNoticeBanner";
import { REACTION_EMOJIS, applyOwnReaction, displayEmoji } from "../../utils/reactions";
import {
  getLocalUri as getCachedMedia,
  peekLocalUri as peekCachedMedia,
} from "../../service/MediaCacheService";
// Keyboard controller gives Android a true keyboard-sticky composer under edge-to-edge.
import {
  KeyboardAvoidingView,
  KeyboardController,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// Keeps the composer above the Android system navigation bar (edge-to-edge).
import StickyInputFooter from "../../components/StickyInputFooter";
import {
  getConversationDownloadUrl,
  getConversationUploadUrl,
  getPresignedUploadUrl,
  uploadFileToOSS,
  deleteOwnUpload,
  deleteOwnConversationUpload,
} from "../../service/OSSService";
import { getStompClient } from "../../service/WebSocketService";
import { searchUsers, getUserById, startGroupChat, startPrivateChat } from "../../service/UserService";
import useDebouncedValue from "../../hooks/useDebouncedValue";
import { setActiveConversation, clearActiveConversation } from "../../utils/activeConversation";
import VoiceRecorder from "../../components/Chat/VoiceRecorder";
import ImageViewer from "../../components/Chat/ImageViewer";
import ComposerActionButton from "../../components/Chat/ComposerActionButton";
import ChatActionSheet from "../../components/Chat/ChatActionSheet";
import ComposerStickerButton from "../../components/Chat/ComposerStickerButton";
import StickerPanel, { stickerPanelHeight } from "../../components/Chat/StickerPanel";
import MessageBubble from "../../components/Chat/MessageBubble";
import { kindOf, messagePreview } from "../../utils/messageKinds";
import {
  getMessageDate,
  resolveTargetTranslationLanguage,
  senderDisplayName,
  webFontSize,
} from "../../utils/chatMessageDisplay";

/**
 * The reply fields an optimistic message carries: the id the server checks, and
 * a preview built from the message being answered, so the quote is on screen
 * before the server's own copy comes back.
 */
const replyFieldsFor = (quoted) =>
  quoted
    ? {
        replyToMessageId: quoted.messageId,
        replyTo: {
          messageId: quoted.messageId,
          senderId: quoted.senderId,
          senderFirstName: quoted.senderFirstName,
          senderLastName: quoted.senderLastName,
          senderBot: !!quoted.senderBot,
          senderDisplayNameZh: quoted.senderDisplayNameZh || null,
          type: quoted.type,
          content: quoted.content,
          hidden: false,
        },
      }
    : {};
import DetailedPrivateChatPage from "./DetailedPrivateChatPage";
import DetailedGroupChatPage from "./DetailedGroupChatPage";
import { confirmAction } from "../../utils/confirmAction";
import { reportMessage } from "../../service/ReportService";
import { getBlockStatus, getBlockedIds } from "../../service/BlockService";
import { parseServerDate } from "../../utils/serverDate";

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

/**
 * The @token being typed, or null when the picker should stay shut.
 *
 * Only a token at the very END of the text counts. That is where the caret is
 * while you are typing a mention, and it avoids tracking the caret through a
 * multiline TextInput across iOS, Android and web — which is far more fragile
 * than the tiny amount of behaviour it would buy.
 */
const MENTION_AT_END = /(?:^|\s)@([^\s@]{0,40})$/;

const activeMentionQuery = (text) => {
  const match = String(text || "").match(MENTION_AT_END);
  return match ? match[1] : null;
};

/** Replaces the trailing @token with a finished mention, keeping any space before it. */
const applyMentionToText = (text, label) =>
  String(text || "").replace(MENTION_AT_END, (whole) => {
    const lead = whole.slice(0, whole.indexOf("@"));
    return `${lead}@${label} `;
  });

const getConversationPreview = (conversation, currentUserId) => {
  const history = conversation?.chatHistory || [];
  const lastMessage = history[history.length - 1];
  if (!lastMessage) return i18n.t("chat");

  const content = messagePreview(lastMessage);
  const isMine = String(lastMessage?.senderId) === String(currentUserId);
  return isMine ? `${i18n.t("chatPreviewYou")}: ${content}` : content;
};

const ChatNativeHeaderTitle = React.memo(function ChatNativeHeaderTitle({
  iconUri,
  iconType,
  conversationId,
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
      <CachedImage
        uri={iconUri}
        type={iconType}
        conversationId={iconType === "group" ? conversationId : undefined}
        fallbackSource={defaultProfileImage}
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
  // The keyboard height spans from the screen edge, but the composer already
  // stands bottom-inset above it (StickyInputFooter's nav-bar strip), so the
  // list only needs lifting by the difference — the full height would open an
  // inset-sized gap between the newest message and the composer.
  const bottomInset = useSafeAreaInsets().bottom;
  const spacerStyle = useAnimatedStyle(
    () => ({
      height: Math.max(0, -height.value - bottomInset),
    }),
    [bottomInset]
  );

  return <Reanimated.View pointerEvents="none" style={spacerStyle} />;
});

export default function ChatPage({ route }) {
  const conversationId = route?.params?.conversationId ?? route?.params?.id ?? null;

  const { user: currentUser } = useContext(UserContext);
  const {
    conversations,
    setConversations,
    setConversationMuted,
    loadOlderMessages,
    ensureHistoryLoaded,
  } = useContext(ChatContext);
  const { language } = useContext(LanguageContext);
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();

  const [inputText, setInputText] = useState("");
  const [editingMessage, setEditingMessage] = useState(null);
  // The message the next send will quote, if the user is replying.
  const [replyingTo, setReplyingTo] = useState(null);
  // Flashed briefly after jumping to a quoted message.
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
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
  // The panel behind the composer's "+" (photo, event share).
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  // The sticker panel, open in the layout under the composer.
  const [stickerPanelVisible, setStickerPanelVisible] = useState(false);

  // Android back closes the sticker panel before it leaves the chat.
  useEffect(() => {
    if (!stickerPanelVisible) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setStickerPanelVisible(false);
      return true;
    });
    return () => subscription.remove();
  }, [stickerPanelVisible]);

  // A different conversation starts with the panel shut.
  useEffect(() => {
    setStickerPanelVisible(false);
  }, [conversationId]);
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

  // Built from conversation participants rather than the global roster — no email
  // exposure, bounded to people you actually chat with. Avatars stay as their stored
  // object paths: this recomputes on every incoming message, and signing here fired
  // a burst of requests per message and gave each avatar a new single-use URL that
  // nothing could cache. CachedImage signs a path once and reuses the download.
  const userDirectory = useMemo(() => {
    const profilesById = {};
    (conversations || []).forEach((conv) =>
      (conv?.participantProfiles || []).forEach((p) => {
        if (p?.id !== null && p?.id !== undefined) profilesById[String(p.id)] = p;
      })
    );
    return profilesById;
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

    // History loads lazily on first open (the list no longer prefetches it);
    // ensureHistoryLoaded is idempotent and no-ops once the page is in.
    if (!conv.historyLoaded) {
      ensureHistoryLoaded(conv.conversationId, conv.conversationType);
    }

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

  // Each conversation's icon as its stored object path, keyed by conversation id.
  // A group carries its own; a private chat borrows the other person's avatar.
  // Signing is left to CachedImage — see the note on userDirectory above.
  const conversationIconPaths = useMemo(() => {
    const next = {};
    (conversations || []).forEach((conv) => {
      if (conv?.conversationType === "group") {
        next[String(conv?.conversationId)] = conv?.groupIcon || "";
      } else {
        const otherParticipantId = (conv?.participants || []).find(
          (participantId) => String(participantId) !== String(currentUser?.id)
        );
        next[String(conv?.conversationId)] =
          userDirectory[String(otherParticipantId)]?.profileImage || "";
      }
    });
    return next;
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

  /**
   * Settle the keyboard as this screen takes focus.
   *
   * The composer lift, the list spacer and the iOS padding all read the same
   * `height`/`progress` shared values, and those belong to the app-wide
   * KeyboardProvider rather than to a screen — nothing resets them on mount. Every
   * route into this page comes from a screen with a focused text field (the chat
   * list's search box, the new-group name field, a profile), so without this the
   * chat paints its keyboard-open layout on the first frame; and if the IME's hide
   * event is missed while those consumers are flipping Android's soft-input mode
   * during the transition, it stays that way with no keyboard on screen.
   *
   * Dismissing here forces a real hide, which is what makes the native side emit
   * the event those shared values are waiting for.
   */
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === "web") return;
      KeyboardController.dismiss().catch(() => {});
    }, [])
  );

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
      ? groupDisplayName(conversation, language)
      : privateChatParticipant?.fullName || "";

  // ---- @mentions -----------------------------------------------------------
  // The composer records who was picked rather than re-parsing the text on send:
  // names contain spaces, two members can share one, and a mention has to keep
  // pointing at the same person if they rename themselves later.
  const [pendingMentions, setPendingMentions] = useState([]);
  const [mentionsEveryone, setMentionsEveryone] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionCandidates, setMentionCandidates] = useState([]);

  // @all reaches everyone at once, so it stays with the group's admins — which,
  // in the app-level group, means the app admins. The server checks this too.
  const canMentionEveryone =
    conversationType === "group" &&
    (conversation?.adminIds || []).some((id) => String(id) === String(currentUser?.id));
  // The same standing decides who may pin the group notice.
  const isGroupAdmin = canMentionEveryone;
  // Set from the "+" panel: the next text sent is pinned as the group notice.
  const [noticeMode, setNoticeMode] = useState(false);

  const handleInputTextChange = useCallback(
    (text) => {
      setInputText(text);
      setMentionQuery(conversationType === "group" ? activeMentionQuery(text) : null);
    },
    [conversationType]
  );

  /**
   * The assistant, as a mention candidate — offered from the conversation rather
   * than found by searching. It is deliberately absent from the member directory
   * so it cannot surface in "start a new chat" or the admin member lists, and the
   * app-level group ships no roster to look it up in either.
   */
  const assistantMention = useMemo(() => {
    if (!conversation?.assistantEnabled || !conversation?.assistantId) return null;
    const names = [conversation.assistantName, conversation.assistantNameZh].filter(Boolean);
    if (!names.length) return null;
    const preferred =
      String(language || "").startsWith("zh") && conversation.assistantNameZh
        ? conversation.assistantNameZh
        : conversation.assistantName;
    return { id: conversation.assistantId, fullName: preferred || names[0], names };
  }, [
    conversation?.assistantEnabled,
    conversation?.assistantId,
    conversation?.assistantName,
    conversation?.assistantNameZh,
    language,
  ]);

  /**
   * Matches the typed token against BOTH names, so "@sha" and "@平安" each find it,
   * and inserts whichever one was being typed rather than overwriting it with the
   * reader's language.
   */
  const assistantCandidateFor = useCallback(
    (query) => {
      if (!assistantMention) return null;
      if (!query) return assistantMention;
      const matched = assistantMention.names.find((name) =>
        name.toLowerCase().startsWith(query)
      );
      return matched ? { ...assistantMention, fullName: matched } : null;
    },
    [assistantMention]
  );

  useEffect(() => {
    if (mentionQuery === null) {
      setMentionCandidates([]);
      return;
    }

    let active = true;
    const query = mentionQuery.trim().toLowerCase();
    const assistant = assistantCandidateFor(query);
    const leading = assistant ? [assistant] : [];

    (async () => {
      const roster = participants.filter(
        (p) =>
          String(p.id) !== String(currentUser?.id) &&
          String(p.id) !== String(assistantMention?.id)
      );
      if (roster.length) {
        const matches = query
          ? roster.filter((p) => (p.fullName || "").toLowerCase().includes(query))
          : roster;
        if (active) setMentionCandidates([...leading, ...matches].slice(0, 8));
        return;
      }

      // No roster in hand means the app-level group, whose membership the server
      // deliberately does not ship. The directory search covers exactly the same
      // people — every verified member — so it stands in for the roster here.
      try {
        const response = await searchUsers(mentionQuery, 0, 8);
        if (!active) return;
        setMentionCandidates(
          [
            ...leading,
            ...(response?.data || [])
              .filter((u) => String(u.id) !== String(currentUser?.id))
              .map((u) => ({ id: u.id, fullName: formatName(u.firstName, u.lastName) })),
          ].slice(0, 8)
        );
      } catch (error) {
        if (active) setMentionCandidates(leading);
      }
    })();

    return () => {
      active = false;
    };
  }, [mentionQuery, participants, currentUser?.id, assistantCandidateFor, assistantMention?.id]);

  const applyMention = useCallback(
    (candidate) => {
      const label = candidate.id === "__all__" ? "all" : candidate.fullName;
      setInputText((text) => applyMentionToText(text, label));
      setMentionQuery(null);

      if (candidate.id === "__all__") {
        setMentionsEveryone(true);
        return;
      }
      setPendingMentions((previous) =>
        previous.some((m) => String(m.id) === String(candidate.id))
          ? previous
          : [...previous, { id: candidate.id, name: candidate.fullName }]
      );
    },
    []
  );

  /**
   * What the message actually claims, checked against the text as it stands now:
   * picking a name and then deleting it should not still notify that person.
   */
  const resolveOutgoingMentions = useCallback(
    (text) => ({
      mentionedUserIds: pendingMentions
        .filter((m) => text.includes(`@${m.name}`))
        .map((m) => m.id),
      mentionsEveryone: mentionsEveryone && canMentionEveryone && text.includes("@all"),
    }),
    [pendingMentions, mentionsEveryone, canMentionEveryone]
  );

  /**
   * The names a message calls out, resolved for display.
   *
   * Ids travel with the message; names are looked up locally, so a mention of
   * someone this device has never seen simply renders unhighlighted rather than
   * costing a fetch per message.
   */
  const mentionLabelsFor = useCallback(
    (message) => {
      const labels = [];
      if (message?.mentionsEveryone) labels.push("all");
      (message?.mentionedUserIds || []).forEach((id) => {
        const key = String(id);
        // The assistant has a name in each language and either could have been
        // typed. splitOnMentions builds one alternation out of these labels, so
        // offering both is what makes "@平安小助手" highlight for an English reader
        // and "@ShalomBot" for a Chinese one.
        if (assistantMention && key === String(assistantMention.id)) {
          assistantMention.names.forEach((name) => labels.push(name));
          return;
        }
        const isCurrentUser = key === String(currentUser?.id);
        const known = isCurrentUser
          ? currentUser
          : participants.find((p) => String(p.id) === key) || userDirectory[key];
        const name =
          known?.fullName || formatName(known?.firstName, known?.lastName);
        if (name) labels.push(name);
      });
      return labels;
    },
    [participants, userDirectory, currentUser, assistantMention]
  );

  const clearPendingMentions = useCallback(() => {
    setPendingMentions([]);
    setMentionsEveryone(false);
    setMentionQuery(null);
  }, []);

  // Nothing carries over between conversations.
  useEffect(() => {
    clearPendingMentions();
  }, [conversationId, clearPendingMentions]);

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

  // Open a PRIVATE conversation positioned at its oldest unread message instead of
  // the bottom. Runs once per open, before the read-marking effect clears unread
  // state, and respects the sliding window: it targets the oldest unread currently
  // loaded (older ones page in as the user scrolls up).
  //
  // Groups deliberately open at the latest message. Their read state is a watermark,
  // not a receipt per message — the church-wide group would otherwise write one row
  // per member per message — so `deliveryStatus` is empty for every group message
  // and the test below cannot see the boundary at all. It used to degrade to "the
  // oldest loaded message somebody else sent", which in a busy group is an arbitrary
  // point days back. Landing on the newest message is both correct and what someone
  // three hundred messages behind actually wants.
  useEffect(() => {
    if (!conversation || anchorHandledRef.current === conversationId) return;
    const history = conversation.chatHistory || [];
    if (!history.length) return; // wait until the first page of messages is present
    anchorHandledRef.current = conversationId; // handle once per open

    // Read off the conversation rather than the state mirror of it, so the type can
    // never lag the history this effect is about to inspect.
    if (conversation.conversationType === "group") return; // newest message; see above
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
  }, [
    conversation?.chatHistory,
    conversation?.conversationType,
    conversation?.unreadCount,
    conversationId,
    currentUser?.id,
    messages,
  ]);

  // Opening a conversation reads all of it, not just the page on screen. The
  // per-message receipts below can only speak for messages the client has loaded,
  // so without this one call everything older stays unread on the server and the
  // badge comes back the next time the conversation list refreshes.
  const latestVisibleMessageId = conversation?.chatHistory?.length
    ? conversation.chatHistory[conversation.chatHistory.length - 1]?.messageId
    : null;
  useEffect(() => {
    if (!currentUser?.id || !conversationId || !conversationType) return;
    let active = true;

    (async () => {
      const result = await markConversationRead(conversationId, conversationType);
      if (!active || result === null) return;

      setConversations((prev) =>
        prev.map((conv) =>
          String(conv.conversationId) === String(conversationId)
            ? { ...conv, unreadCount: 0, mentioned: false }
            : conv
        )
      );
    })();

    return () => {
      active = false;
    };
  }, [
    conversationId,
    conversationType,
    currentUser?.id,
    latestVisibleMessageId,
    setConversations,
  ]);

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
    if (
      !currentUser?.id ||
      !conversationId ||
      conversationType !== "private"
    ) return;

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
    const mentions = resolveOutgoingMentions(trimmed);
    const quoted = replyingTo;
    // Composing a group notice: pin this message once the server has it.
    const pinAfterSend = noticeMode && isGroupAdmin;
    setNoticeMode(false);

    const optimisticMessage = {
      ...mentions,
      ...replyFieldsFor(quoted),
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
    clearPendingMentions();
    setReplyingTo(null);
    setAckTimeout(localId);

    const chatMessage = {
      ...mentions,
      replyToMessageId: quoted?.messageId ?? null,
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
        if (pinAfterSend) {
          // The message is sent either way; only the pin can still fail.
          try {
            const updated = await pinGroupNotice(conversationId, persisted.messageId);
            applyConversationNotice(updated?.notice);
          } catch (pinError) {
            showAlert(i18n.t("error"), pinError?.response?.data || i18n.t("eventActionFailed"));
          }
        }
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
    setReplyingTo(null);
    setStickerPanelVisible(false);
    setInputText(message.content || "");
    closeContextMenu();
    textInputRef.current?.focus();
  };

  const beginReply = (message) => {
    if (!message || messagingBlocked) return;
    closeContextMenu();
    // Editing and replying both own the composer; starting one ends the other.
    if (editingMessage) {
      setEditingMessage(null);
      setInputText("");
    }
    setReplyingTo(message);
    textInputRef.current?.focus();
  };

  // Jumps to a quoted message when it is in the loaded window and flashes it.
  // History pages in from the newest end, so an old original may not be here;
  // loading "around" an arbitrary id is a later step.
  const scrollToMessage = (messageId) => {
    const index = messages.findIndex(
      (it) => it.type !== "date" && String(it.messageId) === String(messageId)
    );
    if (index < 0) {
      showAlert(i18n.t("reply"), i18n.t("replyOriginalNotLoaded"));
      return;
    }
    try {
      flatListRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    } catch (_) {
      // onScrollToIndexFailed retries once rows have mounted
    }
    const key = String(messageId);
    setHighlightedMessageId(key);
    setTimeout(
      () => setHighlightedMessageId((current) => (current === key ? null : current)),
      1800
    );
  };

  // --- group notice ------------------------------------------------------------
  const applyConversationNotice = (notice) => {
    setConversations((prev) =>
      prev.map((conv) =>
        String(conv.conversationId) === String(conversationId) ? { ...conv, notice: notice || null } : conv
      )
    );
  };

  const handlePinMessage = async (message) => {
    closeContextMenu();
    if (!message?.messageId || isLocalOnlyMessage(message) || message.pending) return;
    try {
      const updated = await pinGroupNotice(conversationId, message.messageId);
      applyConversationNotice(updated?.notice);
    } catch (error) {
      showAlert(i18n.t("error"), error?.response?.data || i18n.t("eventActionFailed"));
    }
  };

  const handleUnpin = async () => {
    const confirmed = await confirmAction({
      title: i18n.t("unpinMessage"),
      message: i18n.t("unpinConfirm"),
      confirmText: i18n.t("unpinMessage"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await unpinGroupNotice(conversationId);
      applyConversationNotice(null);
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("eventActionFailed"));
    }
  };

  const showNoticeReaders = async () => {
    try {
      const { read, total } = await getGroupNoticeReaders(conversationId);
      showAlert(i18n.t("noticeReadersTitle"), i18n.t("noticeReaders", { read, total }));
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("eventActionFailed"));
    }
  };

  // Admin holds the banner: remove it, or see how many have read it.
  const manageNotice = () => {
    Alert.alert(i18n.t("groupNotice"), undefined, [
      { text: i18n.t("noticeReadersTitle"), onPress: showNoticeReaders },
      { text: i18n.t("unpinMessage"), style: "destructive", onPress: handleUnpin },
      { text: i18n.t("cancel"), style: "cancel" },
    ]);
  };

  // The pinned message first (that is what people want to read); the "📌" line
  // it posted is newer and more likely still loaded, so it is the fallback.
  const jumpToNotice = (notice) => {
    const loaded = (id) =>
      id != null && messages.some((it) => it.type !== "date" && String(it.messageId) === String(id));
    if (loaded(notice?.messageId)) return scrollToMessage(notice.messageId);
    if (loaded(notice?.noticeMessageId)) return scrollToMessage(notice.noticeMessageId);
    return scrollToMessage(notice?.messageId);
  };

  const beginNotice = () => {
    setActionSheetVisible(false);
    if (!isGroupAdmin || messagingBlocked) return;
    setReplyingTo(null);
    if (editingMessage) {
      setEditingMessage(null);
      setInputText("");
    }
    setNoticeMode(true);
    setTimeout(() => textInputRef.current?.focus(), 250);
  };

  // --- polls -------------------------------------------------------------------
  const startPoll = (mode) => {
    setActionSheetVisible(false);
    if (messagingBlocked || conversationType !== "group") return;
    setTimeout(
      () => navigation.navigate("PollComposer", { conversationId, conversationType, mode }),
      200
    );
  };

  // Every poll call answers with the poll's message as this reader now sees it
  // (their own choices and reactions filled in); it simply replaces the row.
  const applyMessage = (dto) => {
    if (!dto?.messageId) return;
    updateConversationHistory((history) =>
      history.map((msg) => (String(msg.messageId) === String(dto.messageId) ? { ...msg, ...dto } : msg))
    );
  };

  const pollAction = async (action) => {
    try {
      applyMessage(await action());
    } catch (error) {
      showAlert(
        i18n.t("error"),
        typeof error?.response?.data === "string" ? error.response.data : i18n.t("eventActionFailed")
      );
    }
  };

  const handleVote = (poll, optionIds) => pollAction(() => votePoll(poll.id, optionIds));
  const handleSignUp = (poll, note) => pollAction(() => addPollEntry(poll.id, note));
  const handleLeaveSignUp = (poll) => pollAction(() => removePollEntry(poll.id));
  const handleClosePoll = async (poll) => {
    const confirmed = await confirmAction({
      title: i18n.t("closePoll"),
      message: i18n.t("closePollConfirm"),
      confirmText: i18n.t("closePoll"),
      cancelText: i18n.t("cancel"),
      destructive: true,
    });
    if (confirmed) pollAction(() => closePoll(poll.id));
  };
  const handleShowVoters = async (poll, option) => {
    try {
      const people = await getPollVoters(poll.id, option.id);
      const names = people
        .map((person) =>
          person.bot
            ? (String(language || "").startsWith("zh") && person.displayNameZh) || person.firstName
            : formatName(person.firstName, person.lastName)
        )
        .filter(Boolean);
      showAlert(
        i18n.t("whoChose", { option: option.text || "" }),
        names.length ? names.join("\n") : i18n.t("noOneYet")
      );
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("eventActionFailed"));
    }
  };

  const applyReactions = (messageId, reactions) => {
    updateConversationHistory((history) =>
      history.map((msg) =>
        String(msg.messageId) === String(messageId) ? { ...msg, reactions } : msg
      )
    );
  };

  // Adds or withdraws the viewer's emoji. Shown at once and confirmed by the
  // server's answer; put back the way it was if the server refuses.
  const handleToggleReaction = async (message, emoji, on) => {
    if (!message?.messageId || message.pending || isLocalOnlyMessage(message)) return;
    closeContextMenu();
    const before = Array.isArray(message.reactions) ? message.reactions : [];
    applyReactions(message.messageId, applyOwnReaction(before, emoji, on));
    try {
      const updated = await toggleReaction(message.messageId, emoji, on);
      if (Array.isArray(updated?.reactions)) applyReactions(message.messageId, updated.reactions);
    } catch (error) {
      applyReactions(message.messageId, before);
      showAlert(i18n.t("error"), i18n.t("eventActionFailed"));
    }
  };

  const showReactors = async (message, emoji) => {
    if (!message?.messageId || isLocalOnlyMessage(message)) return;
    try {
      const people = await getReactionUsers(message.messageId, emoji);
      const names = people
        .map((person) =>
          person.bot
            ? (String(language || "").startsWith("zh") && person.displayNameZh) || person.firstName
            : formatName(person.firstName, person.lastName)
        )
        .filter(Boolean);
      showAlert(
        i18n.t("reactedWith", { emoji: displayEmoji(emoji) }),
        names.length ? names.join("\n") : i18n.t("noOneYet")
      );
    } catch (error) {
      showAlert(i18n.t("error"), i18n.t("eventActionFailed"));
    }
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
    // A photo sent while replying quotes the same message the words would have.
    const quoted = replyingTo;
    setReplyingTo(null);

    appendOptimisticMessage({
      ...replyFieldsFor(quoted),
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
        replyToMessageId: quoted?.messageId ?? null,
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

  // --- stickers ----------------------------------------------------------------
  // The composer's left button: opens the panel where the keyboard would be, or,
  // when it is already open, hands the space back to typing.
  const toggleStickerPanel = () => {
    if (messagingBlocked || editingMessage) return;
    if (stickerPanelVisible) {
      setStickerPanelVisible(false);
      textInputRef.current?.focus();
      return;
    }
    Keyboard.dismiss();
    setStickerPanelVisible(true);
  };

  /**
   * Sends a sticker. The message names the sticker by id; its body is the
   * sticker's fallback emoji — the same one the server will write — so the
   * optimistic bubble matches the server's echo, and a server that predates
   * stickers still stores something every build can show.
   */
  const sendSticker = async (sticker) => {
    if (messagingBlocked || !sticker?.id) return;
    if (!currentUser?.id || !conversationId || !conversationType) return;

    const localId = `local-sticker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    // A sticker sent while replying quotes the same message the words would have.
    const quoted = replyingTo;
    setReplyingTo(null);

    appendOptimisticMessage({
      ...replyFieldsFor(quoted),
      localId,
      clientMessageId: localId,
      messageId: localId,
      content: sticker.emoji,
      stickerId: sticker.id,
      conversationId,
      conversationType,
      senderId: currentUser.id,
      recipientIds: participants.map((p) => p.id).filter((id) => id !== currentUser.id),
      type: "sticker",
      deliveryStatus: {},
      createdAt,
      timestamp: createdAt,
      pending: true,
      failed: false,
    });
    setAckTimeout(localId);

    try {
      const persisted = await sendMessageToDatabase(
        {
          content: sticker.emoji,
          stickerId: sticker.id,
          replyToMessageId: quoted?.messageId ?? null,
          conversationId,
          conversationType,
          senderId: currentUser.id,
          recipientIds: participants.map((p) => p.id).filter((id) => id !== currentUser.id),
          type: "sticker",
          deliveryStatus: {},
          createdAt,
          clientMessageId: localId,
        },
        conversationType
      );
      if (persisted?.messageId) {
        replaceOptimisticMessage(localId, persisted);
        clearAckTimeout(localId);
      }
    } catch (error) {
      updateConversationHistory((history) =>
        history.map((msg) => (msg.localId === localId ? { ...msg, pending: false, failed: true } : msg))
      );
      clearAckTimeout(localId);
      showAlert(i18n.t("error"), i18n.t("stickerSendFailed"));
    }
  };

  const openActionSheet = () => {
    if (messagingBlocked) return;
    Keyboard.dismiss();
    setActionSheetVisible(true);
  };

  // The picker is a full-screen view of its own; let the sheet finish sliding
  // away first rather than opening it over a half-dismissed panel.
  const pickPhotoFromSheet = () => {
    setActionSheetVisible(false);
    setTimeout(pickAndSendImage, 250);
  };

  /**
   * Sends an event card. The optimistic bubble shows the same one-line text the
   * server will write, and the card fills in from the live event as soon as it
   * is on screen. The server checks the event exists and writes the body.
   */
  const shareEvent = async (event) => {
    setActionSheetVisible(false);
    if (messagingBlocked || !event?.id) return;
    if (!currentUser?.id || !conversationId || !conversationType) return;

    const localId = `local-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const fallbackText = ["📅 " + (event.title || ""), [event.date, event.startTime].filter(Boolean).join(" "), event.location]
      .filter(Boolean)
      .join(" · ");

    appendOptimisticMessage({
      localId,
      clientMessageId: localId,
      messageId: localId,
      content: fallbackText,
      sharedEventId: event.id,
      conversationId,
      conversationType,
      senderId: currentUser.id,
      recipientIds: participants.map((p) => p.id).filter((id) => id !== currentUser.id),
      type: "event",
      deliveryStatus: {},
      createdAt,
      timestamp: createdAt,
      pending: true,
      failed: false,
    });
    setAckTimeout(localId);

    try {
      const persisted = await sendMessageToDatabase(
        {
          content: String(event.id),
          sharedEventId: event.id,
          conversationId,
          conversationType,
          senderId: currentUser.id,
          recipientIds: participants.map((p) => p.id).filter((id) => id !== currentUser.id),
          type: "event",
          deliveryStatus: {},
          createdAt,
          clientMessageId: localId,
        },
        conversationType
      );
      if (persisted?.messageId) {
        replaceOptimisticMessage(localId, persisted);
        clearAckTimeout(localId);
      }
    } catch (error) {
      updateConversationHistory((history) =>
        history.map((msg) => (msg.localId === localId ? { ...msg, pending: false, failed: true } : msg))
      );
      clearAckTimeout(localId);
      showAlert(i18n.t("error"), i18n.t("shareEventFailed"));
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
    const quoted = replyingTo;
    setReplyingTo(null);

    appendOptimisticMessage({
      ...replyFieldsFor(quoted),
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
        replyToMessageId: quoted?.messageId ?? null,
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
  // What the long-press menu may offer is decided by the message's kind — see
  // utils/messageKinds, the client twin of the server's MessageKind.
  const contextKind = kindOf(contextMessage);
  const contextMessageType = String(contextMessage?.type || "").toLowerCase();
  const contextMessageIdKey = String(contextMessage?.messageId || "");
  const contextSourceContent = String(contextMessage?.content || "").trim();
  const contextCanCopy = contextKind.canCopy;
  const contextCanDownload = contextKind.canDownload;
  const contextTargetLanguage = resolveTargetTranslationLanguage(
    contextSourceContent,
    language
  );
  const contextTranslation = contextMessageIdKey ? translations[contextMessageIdKey] : null;
  const contextCanTranslate =
    isTranslationEnabled &&
    contextKind.canTranslate &&
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
  // Anything real can be answered — yours or theirs, words or media.
  const contextCanReply =
    !!contextMessage &&
    !messagingBlocked &&
    !contextMessage.pending &&
    !contextMessage.failed &&
    !isLocalOnlyMessage(contextMessage);
  // Group admins pin any real message as the notice — except a "📌" line itself.
  const contextCanPin = contextCanReply && isGroupAdmin && contextKind.bubble !== "notice";

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
    conversationIconPaths[String(conversationId)] || "";

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <ChatNativeHeaderTitle
          iconUri={activeConversationIcon}
          iconType={conversationType === "group" ? "group" : "profile"}
          conversationId={conversationId}
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
    conversationType,
    handleOpenChatDetails,
    language,
    muted,
    navigation,
  ]);

  const chatSidebarConversations = useMemo(() => {
    return [...conversations]
      .sort(compareConversations)
      .map((conv) => {
        const isGroup = conv.conversationType === "group";
        let title = groupDisplayName(conv, language);

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
  }, [conversations, currentUser?.id, language]);

  const filteredSidebarConversations = useMemo(() => {
    const query = String(sidebarSearchQuery || "").trim().toLowerCase();
    if (!query) return chatSidebarConversations;

    return chatSidebarConversations.filter((item) => {
      const title = String(item?.sidebarTitle || "").toLowerCase();
      const preview = String(item?.sidebarPreview || "").toLowerCase();
      return title.includes(query) || preview.includes(query);
    });
  }, [chatSidebarConversations, sidebarSearchQuery]);

  // Mirrors the phone list: the app-level group first, then the permanent Threads
  // entry, then ordinary conversations by recency.
  const sidebarRows = useMemo(() => {
    const rows = [...filteredSidebarConversations];
    const query = String(sidebarSearchQuery || "").trim().toLowerCase();
    if (query && !i18n.t("topicsThreadsOverview").toLowerCase().includes(query)) {
      return rows;
    }
    const appGroupIndex = rows.findIndex((c) => c.appLevel);
    rows.splice(appGroupIndex + 1, 0, { conversationId: "__topics__", isTopicsRow: true });
    return rows;
  }, [filteredSidebarConversations, sidebarSearchQuery, language]);

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
      // Same rule as useUserSearch: chat is verified-only, and an explicit false
      // is what hides a row so an older server's payload still lists everyone.
      setNewChatUsers(
        (res?.data || []).filter(
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
          // Floats a fixed distance above the composer's bottom edge; with the
          // sticker panel open that edge is the panel's, so lift it past it.
          style={[
            styles.jumpToEndButton,
            stickerPanelVisible && { bottom: 78 + stickerPanelHeight(windowWidth) },
          ]}
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

      {/* Composing the group notice: the next text sent is pinned. */}
      {noticeMode && !editingMessage && (
        <View style={styles.replyBar}>
          <View style={[styles.replyBarStripe, { backgroundColor: "#B26A00" }]} />
          <View style={styles.replyBarText}>
            <Text style={[styles.replyBarName, { color: "#B26A00" }]} numberOfLines={1}>
              {i18n.t("groupNotice")}
            </Text>
            <Text style={styles.replyBarPreview} numberOfLines={1}>
              {i18n.t("composeNoticeHint")}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setNoticeMode(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("cancel")}
          >
            <Ionicons name="close-circle" size={22} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      )}

      {/* What the next send will quote. Sits where the editing banner does;
          the two never show together (beginReply / beginEditMessage). */}
      {replyingTo && !editingMessage && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarStripe} />
          <View style={styles.replyBarText}>
            <Text style={styles.replyBarName} numberOfLines={1}>
              {i18n.t("replyingTo", { name: senderDisplayName(replyingTo, language) })}
            </Text>
            <Text style={styles.replyBarPreview} numberOfLines={1}>
              {messagePreview(replyingTo)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setReplyingTo(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("cancel")}
          >
            <Ionicons name="close-circle" size={22} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      )}

      {messagingBlocked && (
        <View style={styles.blockedBanner}>
          <Ionicons name="ban-outline" size={16} color="#8E8E93" />
          <Text style={styles.blockedBannerText}>{i18n.t("messagingBlockedNotice")}</Text>
        </View>
      )}

      {/* Mention picker. Sits directly above the composer, so the list and the
          text being typed stay together on screen with the keyboard up. */}
      {mentionQuery !== null && (mentionCandidates.length > 0 || canMentionEveryone) && (
        <View style={styles.mentionPicker}>
          <ScrollView keyboardShouldPersistTaps="always" style={styles.mentionPickerScroll}>
            {canMentionEveryone && "all".startsWith(mentionQuery.toLowerCase()) && (
              <TouchableOpacity
                style={styles.mentionRow}
                onPress={() => applyMention({ id: "__all__" })}
              >
                <View style={[styles.mentionAvatar, styles.mentionAvatarAll]}>
                  <Ionicons name="megaphone" size={16} color="#FFFFFF" />
                </View>
                <Text style={styles.mentionName}>{i18n.t("mentionEveryone")}</Text>
              </TouchableOpacity>
            )}
            {mentionCandidates.map((candidate) => (
              <TouchableOpacity
                key={String(candidate.id)}
                style={styles.mentionRow}
                onPress={() => applyMention(candidate)}
              >
                <CachedImage
                  uri={candidate.profileImage || null}
                  type="profile"
                  fallbackSource={defaultProfileImage}
                  style={styles.mentionAvatar}
                />
                <Text style={styles.mentionName} numberOfLines={1}>
                  {candidate.fullName || i18n.t("unknownUser")}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={[styles.inputContainer, messagingBlocked && styles.inputContainerBlocked]}>
        {/* Stickers, where the photo button used to sit (photos live in the "+"
            panel on the right now). Opens the panel under the composer. */}
        <ComposerStickerButton
          active={stickerPanelVisible}
          disabled={messagingBlocked || !!editingMessage || !conversationId || !conversationType}
          onPress={toggleStickerPanel}
        />

        <View style={styles.inputPill}>
          <TextInput
            ref={textInputRef}
            value={inputText}
            onChangeText={handleInputTextChange}
            placeholder={messagingBlocked ? i18n.t("messagingBlockedPlaceholder") : i18n.t("typeMessage")}
            placeholderTextColor="#98989D"
            style={styles.inputField}
            multiline
            editable={!messagingBlocked}
            // The keyboard and the sticker panel take the same space; typing wins.
            onFocus={() => setStickerPanelVisible(false)}
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

        {/* "+" while the box is empty (opens the actions panel), the paper plane
            once there is text, a check while editing. Icons, not words, so the
            control needs no translation. */}
        <ComposerActionButton
          mode={editingMessage ? "edit" : inputText.trim() ? "send" : "plus"}
          onPress={editingMessage || inputText.trim() ? handleSendOrUpdate : openActionSheet}
          disabled={
            editingMessage || inputText.trim()
              ? isSendDisabled
              : messagingBlocked || !conversationId || !conversationType
          }
          busy={isSendingText && !editingMessage}
        />
      </View>

      {/* In the layout, under the input row, where the keyboard would be: the
          list above shrinks to make room, so the chat stays in view. */}
      <StickerPanel
        visible={stickerPanelVisible && !messagingBlocked && !editingMessage}
        onSend={sendSticker}
      />

      <ChatActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        onPickPhoto={pickPhotoFromSheet}
        onShareEvent={shareEvent}
        canPostNotice={isGroupAdmin}
        onComposeNotice={beginNotice}
        canCreatePoll={conversationType === "group"}
        onCreatePoll={startPoll}
        language={language}
      />
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
      {conversationType === "group" && conversation?.notice && (
        <GroupNoticeBanner
          notice={conversation.notice}
          language={language}
          canManage={isGroupAdmin}
          onOpen={jumpToNotice}
          onManage={manageNotice}
        />
      )}
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
        renderItem={({ item, index }) => {
          if (item.type === "date") {
            return (
              <View style={styles.dateSeparator}>
                <Text style={styles.dateText}>{item.date}</Text>
              </View>
            );
          }

          // The list is inverted, so the message drawn ABOVE this one is the
          // next index; the bubble uses it to decide whether it starts a run.
          return (
            <MessageBubble
              item={item}
              previous={messages[index + 1]}
              currentUserId={currentUser?.id}
              conversationType={conversationType}
              conversationId={conversationId}
              language={language}
              fallbackAvatarPath={userDirectory[String(item.senderId)]?.profileImage || null}
              mentionLabels={mentionLabelsFor(item)}
              translation={translations[String(item.messageId || "")] || null}
              resolveImageUrl={resolveImageUrl}
              onOpenImage={openImageViewer}
              onLongPress={openContextMenu}
              onOpenProfile={(userId) => navigation.navigate("UserProfile", { userId })}
              onOpenEvent={(eventId) => navigation.navigate("Events Detail", { eventId })}
              onReply={beginReply}
              onQuotePress={scrollToMessage}
              onToggleReaction={messagingBlocked ? undefined : handleToggleReaction}
              onShowReactors={showReactors}
              onVote={messagingBlocked ? undefined : handleVote}
              onSignUp={messagingBlocked ? undefined : handleSignUp}
              onLeaveSignUp={messagingBlocked ? undefined : handleLeaveSignUp}
              onClosePoll={handleClosePoll}
              onShowVoters={handleShowVoters}
              isGroupAdmin={isGroupAdmin}
              canReply={!messagingBlocked}
              highlighted={
                highlightedMessageId != null && String(item.messageId) === highlightedMessageId
              }
            />
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
            {/* The fixed emoji set, across the top of the menu. A lit one is
                already yours; pressing it again withdraws it. */}
            {contextCanReply && (
              <View style={styles.reactionPicker}>
                {REACTION_EMOJIS.map(({ key, display }) => {
                  const mine = (contextMessage?.reactions || []).some(
                    (tally) => tally?.emoji === key && tally?.mine
                  );
                  return (
                    <Pressable
                      key={key}
                      onPress={() => handleToggleReaction(contextMessage, key, !mine)}
                      style={[styles.reactionPickerItem, mine && styles.reactionPickerItemMine]}
                      accessibilityRole="button"
                      accessibilityLabel={display}
                      accessibilityState={{ selected: mine }}
                    >
                      <Text style={styles.reactionPickerEmoji}>{display}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {contextCanReply && (
              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => beginReply(contextMenu.message)}
              >
                <Text style={styles.contextMenuItemText}>{i18n.t("reply")}</Text>
              </TouchableOpacity>
            )}

            {contextCanPin && (
              <TouchableOpacity
                style={styles.contextMenuItem}
                onPress={() => handlePinMessage(contextMenu.message)}
              >
                <Text style={styles.contextMenuItemText}>{i18n.t("pinMessage")}</Text>
              </TouchableOpacity>
            )}

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
              contextKind.canEdit &&
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

      <StickyInputFooter background="#F2F2F7">{composerContent}</StickyInputFooter>
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
                        <CachedImage
                          uri={item?.profileImage}
                          type="profile"
                          fallbackSource={defaultProfileImage}
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
                        <CachedImage
                          uri={item?.profileImage}
                          type="profile"
                          fallbackSource={defaultProfileImage}
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
                  data={sidebarRows}
                  keyExtractor={(item) => String(item.conversationId)}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.sidebarConversationListContent}
                  ItemSeparatorComponent={() => <View style={styles.sidebarConversationSeparator} />}
                  renderItem={({ item }) => {
                    // Threads are the one sidebar row that is not a conversation.
                    // Desktop web has no other way in now that the hub is gone.
                    if (item.isTopicsRow) {
                      return (
                        <TouchableOpacity
                          onPress={() => navigation.navigate("ThreadHomePage")}
                          style={styles.sidebarConversationItem}
                        >
                          <View style={[styles.sidebarAvatar, styles.sidebarTopicsAvatar]}>
                            <Ionicons name="documents" size={20} color="#FFFFFF" />
                          </View>
                          <View style={styles.sidebarTextWrap}>
                            <Text style={styles.sidebarConversationTitle} numberOfLines={1}>
                              {i18n.t("topicsThreadsOverview")}
                            </Text>
                            <Text style={styles.sidebarConversationPreview} numberOfLines={1}>
                              {i18n.t("topicsThreadsSubtitle")}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }

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
                        <CachedImage
                          uri={conversationIconPaths[String(item.conversationId)]}
                          type={item.conversationType === "group" ? "group" : "profile"}
                          conversationId={
                            item.conversationType === "group" ? item.conversationId : undefined
                          }
                          fallbackSource={defaultProfileImage}
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
                            {item.mentioned && (
                              <Text style={styles.sidebarMentionMarker}>[@] </Text>
                            )}
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
    // minHeight, not height: at large system font sizes a fixed box clips the text.
    minHeight: 40,
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
  sidebarTopicsAvatar: {
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarMentionMarker: {
    color: "#f97316",
    fontWeight: "800",
  },
  mentionPicker: {
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    overflow: "hidden",
  },
  // Capped so the picker never swallows the conversation behind it.
  mentionPickerScroll: { maxHeight: 190 },
  mentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  mentionAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E9E9EB",
  },
  mentionAvatarAll: {
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
  },
  mentionName: { fontSize: webFontSize(15), color: "#1F1F22", flex: 1 },
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
  editingBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 5,
    backgroundColor: "#EEE",
  },
  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#F2F2F7",
    borderTopWidth: 1,
    borderColor: "#E1E1E6",
  },
  replyBarStripe: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: "#0A84FF",
    marginRight: 10,
  },
  replyBarText: {
    flex: 1,
  },
  replyBarName: {
    fontSize: webFontSize(13),
    fontWeight: "700",
    color: "#0A84FF",
  },
  replyBarPreview: {
    fontSize: webFontSize(13),
    color: "#3C3C43",
    marginTop: 1,
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
  reactionPicker: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  reactionPickerItem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  reactionPickerItemMine: {
    backgroundColor: "#E5F0FF",
  },
  reactionPickerEmoji: {
    fontSize: 24,
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
});
