import React from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import defaultProfileImage from "../../../assets/user.png";
// The assistant has no stored avatar; it wears the app's own icon.
import appIcon from "../../../assets/icon.png";
import i18n from "../../../i18n";
import CachedImage from "../CachedImage";
import { formatName } from "../../utils/formatName";
import { kindOf } from "../../utils/messageKinds";
import {
  formatDeliveryStateLabel,
  formatTime,
  parseVoiceContent,
  resolveOutgoingDeliveryState,
  resolveTargetTranslationLanguage,
  splitOnMentions,
  webFontSize,
} from "../../utils/chatMessageDisplay";
import ChatImage from "./ChatImage";
import EventShareCard from "./EventShareCard";
import VoicePlayer from "./VoicePlayer";

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
}) {
  const isMe = item.senderId === currentUserId;
  // In a group there is no other way to tell who is speaking, so incoming
  // messages carry the sender's face and name. Your own don't — you know
  // who you are — and a private chat has exactly one other person.
  const showsSender = conversationType === "group" && !isMe;
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
  const senderName = isAssistant
    ? (String(language || "").startsWith("zh") && item.senderDisplayNameZh) ||
      item.senderFirstName ||
      i18n.t("unknownUser")
    : formatName(item.senderFirstName, item.senderLastName) || i18n.t("unknownUser");
  const isFailed = item.failed;
  const isPending = item.pending;
  // Reported messages are shadow-hidden: everyone except the sender sees
  // a muted placeholder until an admin resolves the report.
  const isShadowHidden = !!item.reported && !isMe;
  const kind = kindOf(item);
  const isVoice = !isShadowHidden && kind.bubble === "voice";
  const isImage = !isShadowHidden && kind.bubble === "image";
  // A shared event draws as a card. Without an id (should not happen)
  // it falls through to the text bubble, which shows the stored line.
  const isEvent = !isShadowHidden && kind.bubble === "event" && item.sharedEventId != null;
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

  const longPress = onLongPress ? (event) => onLongPress(item, event) : undefined;

  const bubble = (
    <TouchableOpacity
      // Images handle their own long press inside <ChatImage>, but the
      // bubble has padding around the photo — catching it here too means a
      // press on the margin still opens the menu.
      onLongPress={Platform.OS === "web" || isShadowHidden ? undefined : longPress}
      onPress={
        Platform.OS === "web" && !isImage && !isEvent && !isShadowHidden ? longPress : undefined
      }
      activeOpacity={0.7}
      style={[
        styles.message,
        isVoice
          ? (isMe ? styles.voiceMessageBubbleSent : styles.voiceMessageBubbleReceived)
          : isImage || isEvent
            ? (isMe ? styles.imageMessageBubbleSent : styles.imageMessageBubbleReceived)
            : (isMe ? styles.sentMessage : styles.receivedMessage),
        isEvent ? styles.eventMessageBubble : null,
        isVoice ? styles.voiceMessageBubble : null,
        isFailed ? styles.failedMessage : null,
        // The avatar gutter replaces the bubble's own left margin.
        showsSender ? styles.groupMessageBubble : null,
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
          isImage || isEvent ? styles.imageTimestamp : (isMe ? styles.timestampSent : styles.timestampReceived),
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
            isImage || isEvent ? styles.imageTimestamp : styles.timestampSent,
            isVoice ? styles.deliveryStatusVoice : null,
            !isImage && !isEvent && outgoingDeliveryState === "seen" ? styles.deliveryStatusSeen : null,
          ]}
        >
          {formatDeliveryStateLabel(outgoingDeliveryState)}
        </Text>
      )}
    </TouchableOpacity>
  );

  if (!showsSender) return bubble;

  return (
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
        {isAssistant && (
          // Chrome, not message text. In the body it would ride along in
          // the push notification and stand in for the answer as the
          // conversation-list preview, and cost tokens on every reply.
          <Text style={styles.assistantDisclaimer}>{i18n.t("assistantDisclaimer")}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
