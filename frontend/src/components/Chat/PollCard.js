import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import i18n from "../../../i18n";
import { senderDisplayName, webFontSize } from "../../utils/chatMessageDisplay";
import { POLL_MULTI, POLL_SIGNUP, POLL_SINGLE, formatDeadline, pollModeLabel } from "../../utils/polls";

const animateLayout = () =>
  LayoutAnimation.configureNext(LayoutAnimation.create(200, "easeInEaseOut", "opacity"));

/** A result bar that grows to its share when the tallies change. */
function ShareBar({ share, mine }) {
  const width = useRef(new Animated.Value(share)).current;
  useEffect(() => {
    Animated.spring(width, { toValue: share, friction: 8, tension: 60, useNativeDriver: false }).start();
  }, [share, width]);
  return (
    <View style={styles.barTrack}>
      <Animated.View
        style={[
          styles.barFill,
          mine && styles.barFillMine,
          { width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
        ]}
      />
    </View>
  );
}

/**
 * A poll or sign-up sheet, drawn in the conversation.
 *
 * Everything shown comes from `poll` on the message, which the server refreshes
 * on every vote (see PollService.rebroadcast) — so the bars move on every
 * phone as people choose. A single-choice poll takes one tap per person (tap
 * your choice again to withdraw); a multiple-choice poll toggles; a sign-up
 * sheet lists people in the order they joined, with an optional note.
 */
export default function PollCard({
  poll,
  currentUserId,
  isGroupAdmin,
  language,
  onVote,
  onSignUp,
  onLeave,
  onClose,
  onShowVoters,
}) {
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);
  const [note, setNote] = useState("");

  if (!poll) return null;

  const mode = poll.mode || POLL_SINGLE;
  const isSignup = mode === POLL_SIGNUP;
  const closed = !!poll.closed;
  const mine = Array.isArray(poll.myOptionIds) ? poll.myOptionIds.map(String) : [];
  const options = Array.isArray(poll.options) ? poll.options : [];
  const canManage =
    !closed && (String(poll.creatorId) === String(currentUserId) || !!isGroupAdmin);
  const totalVotes = options.reduce((sum, option) => sum + Number(option.count || 0), 0);
  const myEntry = isSignup
    ? options.find((option) => String(option.createdById) === String(currentUserId))
    : null;
  const full = isSignup && poll.maxEntries != null && options.length >= poll.maxEntries;

  const run = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const choose = (option) => {
    if (closed || !onVote) return;
    const id = String(option.id);
    let next;
    if (mode === POLL_MULTI) {
      next = mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id];
    } else {
      next = mine.includes(id) ? [] : [id];
    }
    run(() => onVote(poll, next.map(Number)));
  };

  const submitSignup = () => {
    if (closed || full || !onSignUp) return;
    const text = note.trim();
    run(async () => {
      await onSignUp(poll, text);
      animateLayout();
      setJoining(false);
      setNote("");
    });
  };

  const entryName = (option) =>
    senderDisplayName(
      {
        senderBot: option.createdByBot,
        senderDisplayNameZh: option.createdByDisplayNameZh,
        senderFirstName: option.createdByFirstName,
        senderLastName: option.createdByLastName,
      },
      language
    );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.chip, isSignup ? styles.chipSignup : styles.chipPoll]}>
          <Ionicons name={isSignup ? "list" : "stats-chart"} size={12} color="#FFFFFF" />
          <Text style={styles.chipText}>{pollModeLabel(mode)}</Text>
        </View>
        {poll.anonymous && (
          <View style={[styles.chip, styles.chipMuted]}>
            <Text style={[styles.chipText, styles.chipTextMuted]}>{i18n.t("anonymousPoll")}</Text>
          </View>
        )}
        {closed && (
          <View style={[styles.chip, styles.chipMuted]}>
            <Text style={[styles.chipText, styles.chipTextMuted]}>{i18n.t("pollClosed")}</Text>
          </View>
        )}
      </View>

      <Text style={styles.question}>{poll.question}</Text>

      {isSignup ? (
        <View style={styles.list}>
          {options.length === 0 && <Text style={styles.empty}>{i18n.t("noOneYet")}</Text>}
          {options.map((option, index) => {
            const isMine = String(option.createdById) === String(currentUserId);
            return (
              <View key={option.id} style={styles.entryRow}>
                <Text style={styles.entryIndex}>{index + 1}.</Text>
                <View style={styles.entryText}>
                  <Text style={[styles.entryName, isMine && styles.entryNameMine]} numberOfLines={1}>
                    {option.text || entryName(option)}
                  </Text>
                  {!!option.note && (
                    <Text style={styles.entryNote} numberOfLines={2}>
                      {option.note}
                    </Text>
                  )}
                </View>
                {isMine && !closed && (
                  <Pressable onPress={() => run(() => onLeave?.(poll))} hitSlop={6} disabled={busy}>
                    <Text style={styles.leave}>{i18n.t("leaveSignup")}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}

          {!closed && !myEntry && !full && (
            joining ? (
              <View style={styles.joinBox}>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder={i18n.t("signupNotePlaceholder")}
                  placeholderTextColor="#98989D"
                  style={styles.noteInput}
                  maxLength={200}
                  autoFocus
                />
                <View style={styles.joinActions}>
                  <TouchableOpacity
                    onPress={() => {
                      animateLayout();
                      setJoining(false);
                      setNote("");
                    }}
                    style={styles.joinCancel}
                  >
                    <Text style={styles.joinCancelText}>{i18n.t("cancel")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={submitSignup} style={styles.joinConfirm} disabled={busy}>
                    {busy ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.joinConfirmText}>{i18n.t("signUp")}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  animateLayout();
                  setJoining(true);
                }}
                style={styles.joinButton}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle" size={18} color="#0A84FF" />
                <Text style={styles.joinButtonText}>{i18n.t("signUp")}</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      ) : (
        <View style={styles.list}>
          {options.map((option) => {
            const isMine = mine.includes(String(option.id));
            const share = totalVotes > 0 ? Number(option.count || 0) / totalVotes : 0;
            return (
              <Pressable
                key={option.id}
                onPress={() => choose(option)}
                disabled={closed || busy}
                style={({ pressed }) => [styles.option, pressed && !closed && styles.optionPressed]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isMine, disabled: closed }}
              >
                <View style={styles.optionRow}>
                  <Ionicons
                    name={
                      isMine
                        ? mode === POLL_MULTI
                          ? "checkbox"
                          : "radio-button-on"
                        : mode === POLL_MULTI
                          ? "square-outline"
                          : "radio-button-off"
                    }
                    size={20}
                    color={isMine ? "#0A84FF" : "#8E8E93"}
                  />
                  <Text style={[styles.optionText, isMine && styles.optionTextMine]} numberOfLines={2}>
                    {option.text}
                  </Text>
                  <Pressable
                    onPress={poll.anonymous || !onShowVoters ? undefined : () => onShowVoters(poll, option)}
                    hitSlop={8}
                    disabled={poll.anonymous || !onShowVoters}
                  >
                    <Text style={[styles.count, !poll.anonymous && styles.countLink]}>
                      {option.count || 0}
                    </Text>
                  </Pressable>
                </View>
                <ShareBar share={share} mine={isMine} />
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.meta} numberOfLines={1}>
          {isSignup
            ? poll.maxEntries != null
              ? i18n.t("signupCountWithMax", { count: options.length, max: poll.maxEntries })
              : i18n.t("signupCount", { count: options.length })
            : i18n.t("pollVoters", { count: poll.voterCount || 0 })}
          {poll.deadline && !closed ? ` · ${i18n.t("deadlineAt", { time: formatDeadline(poll.deadline, language) })}` : ""}
          {full && !closed ? ` · ${i18n.t("pollFull")}` : ""}
        </Text>
        {canManage && (
          <Pressable onPress={() => onClose?.(poll)} hitSlop={6} disabled={busy}>
            <Text style={styles.closeLink}>{i18n.t("closePoll")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 280,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D1D1D6",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chipPoll: { backgroundColor: "#5856D6" },
  chipSignup: { backgroundColor: "#AF52DE" },
  chipMuted: { backgroundColor: "#EEEEF0" },
  chipText: {
    fontSize: webFontSize(11),
    fontWeight: "700",
    color: "#FFFFFF",
  },
  chipTextMuted: { color: "#6B6B70" },
  question: {
    fontSize: webFontSize(16),
    fontWeight: "700",
    color: "#111113",
    marginBottom: 8,
  },
  list: {
    gap: 6,
  },
  option: {
    borderRadius: 10,
    paddingVertical: 4,
  },
  optionPressed: {
    backgroundColor: "#F2F2F7",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionText: {
    flex: 1,
    fontSize: webFontSize(15),
    color: "#111113",
  },
  optionTextMine: {
    fontWeight: "600",
  },
  count: {
    minWidth: 22,
    textAlign: "right",
    fontSize: webFontSize(13),
    color: "#8E8E93",
  },
  countLink: {
    color: "#0A84FF",
  },
  barTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#EEEEF0",
    marginTop: 4,
    marginLeft: 28,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#C7C7CC",
  },
  barFillMine: {
    backgroundColor: "#0A84FF",
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 2,
  },
  entryIndex: {
    width: 22,
    fontSize: webFontSize(14),
    color: "#8E8E93",
    textAlign: "right",
  },
  entryText: {
    flex: 1,
  },
  entryName: {
    fontSize: webFontSize(15),
    color: "#111113",
  },
  entryNameMine: {
    fontWeight: "700",
    color: "#0A84FF",
  },
  entryNote: {
    fontSize: webFontSize(13),
    color: "#6B6B70",
    marginTop: 1,
  },
  leave: {
    fontSize: webFontSize(13),
    color: "#FF3B30",
    paddingTop: 2,
  },
  empty: {
    fontSize: webFontSize(14),
    color: "#8E8E93",
    paddingVertical: 4,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 6,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#E5F0FF",
  },
  joinButtonText: {
    fontSize: webFontSize(15),
    fontWeight: "600",
    color: "#0A84FF",
  },
  joinBox: {
    marginTop: 6,
    gap: 8,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#D1D1D6",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: webFontSize(14),
    color: "#111113",
  },
  joinActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  joinCancel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  joinCancelText: {
    fontSize: webFontSize(14),
    color: "#8E8E93",
  },
  joinConfirm: {
    minWidth: 84,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#0A84FF",
  },
  joinConfirmText: {
    fontSize: webFontSize(14),
    fontWeight: "700",
    color: "#FFFFFF",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 8,
  },
  meta: {
    flexShrink: 1,
    fontSize: webFontSize(12),
    color: "#8E8E93",
  },
  closeLink: {
    fontSize: webFontSize(13),
    fontWeight: "600",
    color: "#FF3B30",
  },
});
