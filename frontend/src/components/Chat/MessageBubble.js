import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import defaultProfileImage from "../../../assets/user.png";
// The assistant has no stored avatar; it wears the app's own icon.
import appIcon from "../../../assets/icon.png";
import i18n from "../../../i18n";
import CachedImage from "../CachedImage";
import { kindOf, messagePreview } from "../../utils/messageKinds";
import { displayEmoji } from "../../utils/reactions";
import {
  formatDeliveryStateLabel,
  formatTime,
  parseVoiceContent,
  resolveOutgoingDeliveryState,
  resolveTargetTranslationLanguage,
  senderDisplayName,
  splitOnMentions,
  webFontSize,
} from "../../utils/chatMessageDisplay";
import ChatImage from "./ChatImage";
import EventShareCard from "./EventShareCard";
import PollCard from "./PollCard";
import VoicePlayer from "./VoicePlayer";

// Dragging a message this far to the right starts a reply to it.
const SWIPE_REPLY_THRESHOLD = 60;
const SWIPE_MAX = 72;

const isLocalOnly = (message) =>
  typeof message?.messageId === "string" && message.messageId.startsWith("local-");

/**
 * The quoted message at the top of a reply. Tapping it jumps to the original.
 * `tone` follows the bubble it sits in: on the sender's blue, on the grey of a
 * received message, or framed on its own above a photo or card.
 */
function QuoteBlock({ quote, tone, language, onPress }) {
  if (!quote) return null;
  const body = quote.hidden ? i18n.t("reportedPendingReview") : messagePreview(quote);
  return (
    <TouchableOpacity
      onPress={onPress ? () => onPress(quote.messageId) : undefined}
      activeOpacity={0.7}
      style={[styles.quote, styles[`quote_${tone}`]]}
      accessibilityRole="button"
      accessibilityLabel={`${senderDisplayName(quote, language)}: ${body}`}
    >
      <View style={[styles.quoteBar, styles[`quoteBar_${tone}`]]} />
      <View style={styles.quoteText}>
        <Text style={[styles.quoteName, styles[`quoteName_${tone}`]]} numberOfLines={1}>
          {senderDisplayName(quote, language)}
        </Text>
        <Text
          style={[styles.quoteBody, styles[`quoteBody_${tone}`], quote.hidden && styles.quoteBodyHidden]}
          numberOfLines={2}
        >
          {body}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * One message in the conversation: the bubble itself and, in a group, the
 * sender's avatar and name beside it.
 *
 * Lifted out of ChatPage's renderItem so the page stops growing every time a
 * message learns a new trick. Everything the row needs to know arrives as props;
 * the parent keeps the list, the menus and the network.
 *
 * `previous` is the message drawn ABOVE this one — in an inverted list that is
 * the next index — and decides whether this row starts a run and shows the name.
 *
 * Replying: a drag to the right (PanResponder, not gesture-handler — the app
 * mounts no GestureHandlerRootView, see ImageViewer) or the long-press menu
 * calls `onReply`. A quoted message is drawn by QuoteBlock; `highlighted`
 * flashes the row after a jump to it.
 */
export default function MessageBubble({
  item,
  previous,
  currentUserId,
  conversationType,
  conversationId,
  language,
  fallbackAvatarPath,
  mentionLabels,
  translation,
  resolveImageUrl,
  onOpenImage,
  onLongPress,
  onOpenProfile,
  onOpenEvent,
  onReply,
  onQuotePress,
  onToggleReaction,
  onShowReactors,
  onVote,
  onSignUp,
  onLeaveSignUp,
  onClosePoll,
  onShowVoters,
  isGroupAdmin = false,
  canReply = true,
  highlighted = false,
}) {
  const isMe = item.senderId === currentUserId;
  const kind = kindOf(item);
  // Reported messages are shadow-hidden: everyone except the sender sees
  // a muted placeholder until an admin resolves the report.
  const isShadowHidden = !!item.reported && !isMe;
  // A pinned-notice line is the group speaking, centred and unsigned.
  const isNotice = !isShadowHidden && kind.bubble === "notice";
  // In a group there is no other way to tell who is speaking, so incoming
  // messages carry the sender's face and name. Your own don't — you know
  // who you are — and a private chat has exactly one other person.
  const showsSender = conversationType === "group" && !isMe && !isNotice;
  // Only the first message of a run is labelled; repeating the avatar and name
  // down a burst of five replies is just noise.
  const startsRun =
    !previous ||
    previous.type === "date" ||
    String(previous.senderId) !== String(item.senderId);
  // The message carries the sender's avatar path itself, so this still works
  // in the app-level group, whose roster is deliberately not sent to clients.
  // The directory is the fallback for messages stored before that field existed.
  const senderAvatarPath = item.senderProfileImage || fallbackAvatarPath || null;
  // The assistant is named in both languages and carries no stored avatar,
  // so it is drawn from the app icon and named for whoever is reading.
  const isAssistant = !!item.senderBot;
  const senderName = senderDisplayName(item, language);
  const isFailed = item.failed;
  const isPending = item.pending;
  const isVoice = !isShadowHidden && kind.bubble === "voice";
  const isImage = !isShadowHidden && kind.bubble === "image";
  // A shared event draws as a card. Without an id (should not happen)
  // it falls through to the text bubble, which shows the stored line.
  const isEvent = !isShadowHidden && kind.bubble === "event" && item.sharedEventId != null;
  // A poll draws as a card; without its data (should not happen) the stored
  // "📊 question" line shows as text instead.
  const isPoll = !isShadowHidden && kind.bubble === "poll" && !!item.poll;
  const isCard = isImage || isEvent || isPoll;
  const expectedTargetLanguage = resolveTargetTranslationLanguage(item.content, language);
  const outgoingDeliveryState = isMe
    ? resolveOutgoingDeliveryState(item.deliveryStatus, currentUserId)
    : null;
  const showOutgoingDeliveryState =
    isMe && !isPending && !isFailed && !!outgoingDeliveryState;
  const showTranslation =
    !!translation?.visible &&
    translation?.targetLang === expectedTargetLanguage &&
    translation?.sourceContent === String(item.content || "").trim();
  const quote = isShadowHidden ? null : item.replyTo || null;
  const quoteTone = isCard || isNotice ? "plain" : isMe ? "sent" : "received";

  const longPress = onLongPress ? (event) => onLongPress(item, event) : undefined;

  // --- swipe to reply ---------------------------------------------------------
  const swipeEnabled =
    Platform.OS !== "web" &&
    canReply &&
    !!onReply &&
    !isShadowHidden &&
    !isPending &&
    !isFailed &&
    !isLocalOnly(item);
  const swipeX = useRef(new Animated.Value(0)).current;
  const settle = () =>
    Animated.spring(swipeX, { toValue: 0, friction: 6, tension: 120, useNativeDriver: false }).start();
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim the touch only once it is clearly a rightward drag, so vertical
        // scrolling and plain taps stay with the list and the bubble.
        onMoveShouldSetPanResponder: (_, gesture) =>
          swipeEnabled &&
          gesture.dx > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderMove: (_, gesture) =>
          swipeX.setValue(Math.min(SWIPE_MAX, Math.max(0, gesture.dx * 0.6))),
        onPanResponderRelease: (_, gesture) => {
          const triggered = gesture.dx * 0.6 >= SWIPE_REPLY_THRESHOLD * 0.6;
          settle();
          if (triggered) onReply(item);
        },
        onPanResponderTerminate: settle,
        onPanResponderTerminationRequest: () => true,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [swipeEnabled, onReply, item]
  );

  // --- jump highlight ---------------------------------------------------------
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!highlighted) return;
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 1200, delay: 400, useNativeDriver: false }).start();
  }, [highlighted, flash]);

  const bubble = (
    <TouchableOpacity
      // Images handle their own long press inside <ChatImage>, but the
      // bubble has padding around the photo — catching it here too means a
      // press on the margin still opens the menu.
      onLongPress={Platform.OS === "web" || isShadowHidden ? undefined : longPress}
      onPress={Platform.OS === "web" && !isCard && !isShadowHidden ? longPress : undefined}
      activeOpacity={0.7}
      style={[
        styles.message,
        isNotice
          ? styles.noticeMessage
          : isVoice
            ? (isMe ? styles.voiceMessageBubbleSent : styles.voiceMessageBubbleReceived)
            : isCard
              ? (isMe ? styles.imageMessageBubbleSent : styles.imageMessageBubbleReceived)
              : (isMe ? styles.sentMessage : styles.receivedMessage),
        isEvent ? styles.eventMessageBubble : null,
        isPoll ? styles.pollMessageBubble : null,
        isVoice ? styles.voiceMessageBubble : null,
        isFailed ? styles.failedMessage : null,
        // The avatar gutter replaces the bubble's own left margin.
        showsSender ? styles.groupMessageBubble : null,
      ]}
    >
      {isNotice && (
        <View style={styles.noticeHeader}>
          <Ionicons name="pin" size={13} color="#B26A00" />
          <Text style={styles.noticeHeaderText}>{i18n.t("groupNotice")}</Text>
        </View>
      )}

      <QuoteBlock quote={quote} tone={quoteTone} language={language} onPress={onQuotePress} />

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
          onPress={onOpenImage}
          onLongPress={Platform.OS === "web" || isShadowHidden ? undefined : onLongPress}
        />
      ) : isEvent ? (
        <EventShareCard
          eventId={item.sharedEventId}
          fallbackText={item.content}
          language={language}
          onOpen={onOpenEvent}
          onLongPress={Platform.OS === "web" ? undefined : longPress}
        />
      ) : isPoll ? (
        <PollCard
          poll={item.poll}
          currentUserId={currentUserId}
          isGroupAdmin={isGroupAdmin}
          language={language}
          onVote={onVote}
          onSignUp={onSignUp}
          onLeave={onLeaveSignUp}
          onClose={onClosePoll}
          onShowVoters={onShowVoters}
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
      ) : isNotice ? (
        <View style={styles.messageContentContainer}>
          <Text selectable style={[styles.content, styles.noticeContent]}>
            {String(item.content || "").replace(/^📌\s*/, "")}
          </Text>
        </View>
      ) : (
        <View style={styles.messageContentContainer}>
          <Text
            selectable
            style={[
              styles.content,
              isMe ? styles.contentSent : styles.contentReceived,
            ]}
          >
            {splitOnMentions(item.content, mentionLabels).map((part, partIndex) =>
              part.isMention ? (
                <Text
                  key={partIndex}
                  style={isMe ? styles.mentionInSent : styles.mentionInReceived}
                >
                  {part.text}
                </Text>
              ) : (
                part.text
              )
            )}
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
                {translation.text}
              </Text>
            </View>
          )}
        </View>
      )}

      <Text
        style={[
          styles.timestamp,
          isCard
            ? styles.imageTimestamp
            : isMe && !isNotice
              ? styles.timestampSent
              : styles.timestampReceived,
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
            isCard ? styles.imageTimestamp : styles.timestampSent,
            isVoice ? styles.deliveryStatusVoice : null,
            !isCard && outgoingDeliveryState === "seen" ? styles.deliveryStatusSeen : null,
          ]}
        >
          {formatDeliveryStateLabel(outgoingDeliveryState)}
        </Text>
      )}
    </TouchableOpacity>
  );

  // Emoji tallies, drawn as chips tucked under the bubble's edge. Tap one to add
  // or withdraw your own; hold it to see who is behind the number.
  const tallies = isShadowHidden
    ? []
    : (Array.isArray(item.reactions) ? item.reactions : []).filter((r) => r && Number(r.count) > 0);
  const chips =
    tallies.length > 0 ? (
      <View
        style={[
          styles.reactionRow,
          showsSender ? styles.reactionRowGroup : isMe ? styles.reactionRowSent : styles.reactionRowReceived,
        ]}
      >
        {tallies.map((tally) => (
          <Pressable
            key={tally.emoji}
            onPress={onToggleReaction ? () => onToggleReaction(item, tally.emoji, !tally.mine) : undefined}
            onLongPress={onShowReactors ? () => onShowReactors(item, tally.emoji) : undefined}
            delayLongPress={350}
            style={[styles.reactionChip, tally.mine && styles.reactionChipMine]}
            accessibilityRole="button"
            accessibilityLabel={`${displayEmoji(tally.emoji)} ${tally.count}`}
            accessibilityState={{ selected: !!tally.mine }}
          >
            <Text style={styles.reactionEmoji}>{displayEmoji(tally.emoji)}</Text>
            <Text style={[styles.reactionCount, tally.mine && styles.reactionCountMine]}>{tally.count}</Text>
          </Pressable>
        ))}
      </View>
    ) : null;

  const row = !showsSender ? (
    <View>
      {bubble}
      {chips}
    </View>
  ) : (
    <View style={styles.groupMessageRow}>
      {startsRun ? (
        isAssistant ? (
          // No profile to open, and no stored avatar to fetch: the
          // assistant wears the app icon straight from the bundle.
          <Image source={appIcon} style={styles.groupMessageAvatar} />
        ) : (
          <TouchableOpacity
            onPress={() => onOpenProfile?.(item.senderId)}
            accessibilityRole="button"
            accessibilityLabel={senderName}
          >
            <CachedImage
              uri={senderAvatarPath}
              type="profile"
              fallbackSource={defaultProfileImage}
              style={styles.groupMessageAvatar}
            />
          </TouchableOpacity>
        )
      ) : (
        // Holds the gutter open so every bubble in a run stays on the
        // same left edge as the one carrying the avatar.
        <View style={styles.groupMessageAvatarSpacer} />
      )}
      <View style={styles.groupMessageColumn}>
        {startsRun &&
          (isAssistant ? (
            <View style={styles.assistantNameRow}>
              <Text style={styles.groupSenderName} numberOfLines={1}>
                {senderName}
              </Text>
              <View style={styles.assistantBadge}>
                <Text style={styles.assistantBadgeText}>{i18n.t("aiBadge")}</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={() => onOpenProfile?.(item.senderId)}>
              <Text style={styles.groupSenderName} numberOfLines={1}>
                {senderName}
              </Text>
            </TouchableOpacity>
          ))}
        {bubble}
        {chips}
        {isAssistant && (
          // Chrome, not message text. In the body it would ride along in
          // the push notification and stand in for the answer as the
          // conversation-list preview, and cost tokens on every reply.
          <Text style={styles.assistantDisclaimer}>{i18n.t("assistantDisclaimer")}</Text>
        )}
      </View>
    </View>
  );

  return (
    <Animated.View
      {...(swipeEnabled ? panResponder.panHandlers : {})}
      style={[
        styles.row,
        {
          transform: [{ translateX: swipeX }],
          backgroundColor: flash.interpolate({
            inputRange: [0, 1],
            outputRange: ["rgba(255,204,0,0)", "rgba(255,204,0,0.35)"],
          }),
        },
      ]}
    >
      {swipeEnabled && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeHint,
            { opacity: swipeX.interpolate({ inputRange: [0, SWIPE_REPLY_THRESHOLD * 0.6], outputRange: [0, 1] }) },
          ]}
        >
          <Ionicons name="arrow-undo" size={20} color="#8E8E93" />
        </Animated.View>
      )}
      {row}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "relative",
  },
  swipeHint: {
    position: "absolute",
    left: -32,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  message: {
    marginVertical: 3,
    marginHorizontal: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: "82%",
  },
  // The tightened corner is the bubble's tail, so it sits at the TOP on the
  // sender's side — pointing up at their avatar, which is drawn at the head of
  // the group rather than the foot of it.
  sentMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#0A84FF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  receivedMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#E9E9EB",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
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
  // The card brings its own frame; the bubble only needs to let it be wider.
  eventMessageBubble: {
    maxWidth: 260,
  },
  pollMessageBubble: {
    maxWidth: 300,
  },
  // A pinned-notice line: centred, cream, the group's voice rather than a person's.
  noticeMessage: {
    alignSelf: "center",
    maxWidth: "88%",
    backgroundColor: "#FFF8E1",
    borderWidth: 1,
    borderColor: "#F1DFA3",
  },
  noticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  noticeHeaderText: {
    fontSize: webFontSize(12),
    fontWeight: "700",
    color: "#B26A00",
  },
  noticeContent: {
    color: "#3C3C43",
  },
  failedMessage: {
    borderWidth: 1,
    borderColor: "#E35D5D",
  },
  // Group chats only: an incoming message is drawn as [avatar][name over bubble],
  // so you can tell who is speaking without opening the participant list.
  groupMessageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 12,
    paddingRight: 12,
  },
  groupMessageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    marginTop: 4,
    backgroundColor: "#E9E9EB",
  },
  groupMessageAvatarSpacer: {
    width: 32,
    marginRight: 8,
  },
  groupMessageColumn: {
    flex: 1,
    alignItems: "flex-start",
  },
  assistantNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  assistantBadge: {
    backgroundColor: "#E7E3FF",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  assistantBadgeText: {
    fontSize: webFontSize(10),
    fontWeight: "700",
    color: "#5B4BD6",
    letterSpacing: 0.4,
  },
  assistantDisclaimer: {
    fontSize: webFontSize(11),
    color: "#8E8E93",
    marginTop: 2,
    marginLeft: 4,
    maxWidth: "82%",
  },
  groupSenderName: {
    fontSize: webFontSize(12),
    fontWeight: "600",
    color: "#6B7280",
    marginLeft: 4,
    marginBottom: 2,
  },
  groupMessageBubble: {
    marginHorizontal: 0,
  },
  // The quoted message at the top of a reply.
  quote: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 6,
    paddingVertical: 6,
    paddingRight: 10,
  },
  quote_sent: { backgroundColor: "rgba(255,255,255,0.18)" },
  quote_received: { backgroundColor: "rgba(0,0,0,0.06)" },
  quote_plain: {
    backgroundColor: "#F2F2F7",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D1D1D6",
    maxWidth: 240,
  },
  quoteBar: {
    width: 3,
    borderRadius: 2,
    marginHorizontal: 8,
  },
  quoteBar_sent: { backgroundColor: "#FFFFFF" },
  quoteBar_received: { backgroundColor: "#0A84FF" },
  quoteBar_plain: { backgroundColor: "#0A84FF" },
  quoteText: {
    flexShrink: 1,
  },
  quoteName: {
    fontSize: webFontSize(12),
    fontWeight: "700",
    marginBottom: 1,
  },
  quoteName_sent: { color: "#FFFFFF" },
  quoteName_received: { color: "#0A84FF" },
  quoteName_plain: { color: "#0A84FF" },
  quoteBody: {
    fontSize: webFontSize(13),
  },
  quoteBody_sent: { color: "rgba(255,255,255,0.9)" },
  quoteBody_received: { color: "#3C3C43" },
  quoteBody_plain: { color: "#3C3C43" },
  quoteBodyHidden: {
    fontStyle: "italic",
    opacity: 0.8,
  },
  // Reaction chips overlap the bubble's bottom edge slightly, WhatsApp-style.
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: -6,
    marginBottom: 4,
    zIndex: 1,
  },
  reactionRowSent: {
    alignSelf: "flex-end",
    marginRight: 18,
  },
  reactionRowReceived: {
    alignSelf: "flex-start",
    marginLeft: 18,
  },
  reactionRowGroup: {
    alignSelf: "flex-start",
    marginLeft: 6,
  },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E1E1E6",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  reactionChipMine: {
    backgroundColor: "#E5F0FF",
    borderColor: "#0A84FF",
  },
  reactionEmoji: {
    fontSize: webFontSize(13),
  },
  reactionCount: {
    marginLeft: 3,
    fontSize: webFontSize(12),
    fontWeight: "600",
    color: "#3C3C43",
  },
  reactionCountMine: {
    color: "#0A84FF",
  },
  mentionInSent: { fontWeight: "700", color: "#FFE8C7" },
  mentionInReceived: { fontWeight: "700", color: "#C2410C" },
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
  voiceMessageBubble: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 0,
  },
  // Tail at the top, matching sentMessage / receivedMessage above.
  voiceMessageBubbleSent: {
    alignSelf: "flex-end",
    backgroundColor: "#0A84FF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  voiceMessageBubbleReceived: {
    alignSelf: "flex-start",
    backgroundColor: "#E9E9EB",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
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
