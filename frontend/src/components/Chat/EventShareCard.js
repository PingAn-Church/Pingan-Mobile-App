import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import i18n from "../../../i18n";
import useEventRegistration, { registerEvent } from "../../hooks/useEventRegistration";
import { formatEventDay, formatEventTimeRange, formatRegisteredCount } from "../../utils/eventDisplay";
import { showAlert } from "../../utils/showAlert";
import EventRegisterButton from "../Events/EventRegisterButton";

/**
 * A shared event, drawn as a card in the conversation.
 *
 * The message only carries the event id; everything shown here is loaded live
 * (and shared with every other card and the event page through
 * useEventRegistration), so an edited or rescheduled event is never shown stale
 * and registering on one card flips them all. Until that loads — or if the
 * event has since been deleted — the server-written line stored in the message
 * stands in, which is also what builds without this card show.
 *
 * Quick registration happens right on the card. Once registered, the button
 * opens the event page instead, which is where cancelling lives: a second tap
 * on a chat card should not be able to undo a sign-up by accident.
 */
export default function EventShareCard({ eventId, fallbackText, language, onOpen, onLongPress }) {
  const { status, loading, error, refresh } = useEventRegistration(eventId);
  const [busy, setBusy] = useState(false);
  const appear = useRef(new Animated.Value(status ? 1 : 0)).current;

  const event = status?.event;
  const missing = !!status?.missing;

  useEffect(() => {
    if (event || missing) {
      Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [event, missing, appear]);

  const handleRegister = async () => {
    setBusy(true);
    try {
      const { ok, status: next } = await registerEvent(eventId);
      if (!ok) {
        showAlert(
          i18n.t("error"),
          next?.closedReason === "full" ? i18n.t("registrationFull") : i18n.t("registrationClosed")
        );
      }
    } catch (registerError) {
      showAlert(i18n.t("error"), i18n.t("eventActionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const open = () => {
    if (!missing && eventId != null) onOpen?.(eventId);
  };

  return (
    <Pressable
      onPress={open}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.card, pressed && !missing && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={event?.title || fallbackText}
    >
      <View style={styles.header}>
        <Ionicons name="calendar" size={14} color="#FF9500" />
        <Text style={styles.headerText}>{i18n.t("eventShareLabel")}</Text>
      </View>

      {!event ? (
        <View style={styles.body}>
          <Text style={[styles.fallback, missing && styles.fallbackMissing]} numberOfLines={3}>
            {String(fallbackText || "").replace(/^📅\s*/, "")}
          </Text>
          {missing ? (
            <Text style={styles.missing}>{i18n.t("eventUnavailable")}</Text>
          ) : error && !loading ? (
            <Pressable onPress={() => refresh(true)} hitSlop={6}>
              <Text style={styles.retry}>{i18n.t("tryAgain")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Animated.View
          style={[
            styles.body,
            {
              opacity: appear,
              transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }],
            },
          ]}
        >
          <Text style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={15} color="#8E8E93" />
            <Text style={styles.meta} numberOfLines={1}>
              {formatEventDay(event.date, language)} {formatEventTimeRange(event.startTime, event.endTime)}
            </Text>
          </View>
          {!!event.location && (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={15} color="#8E8E93" />
              <Text style={styles.meta} numberOfLines={1}>
                {event.location}
              </Text>
            </View>
          )}

          {status.registrationEnabled ? (
            <View style={styles.footer}>
              <Text style={styles.count} numberOfLines={1}>
                {formatRegisteredCount(status)}
              </Text>
              <EventRegisterButton
                status={status}
                busy={busy}
                compact
                onRegister={handleRegister}
                onPressRegistered={open}
              />
            </View>
          ) : (
            <View style={styles.footer}>
              <Text style={styles.viewDetails}>{i18n.t("viewEventDetails")}</Text>
              <Ionicons name="chevron-forward" size={16} color="#0A84FF" />
            </View>
          )}
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 256,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D1D1D6",
    overflow: "hidden",
  },
  cardPressed: {
    backgroundColor: "#F7F7F9",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#FFF7EB",
  },
  headerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#C77700",
  },
  body: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111113",
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  meta: {
    flexShrink: 1,
    fontSize: 14,
    color: "#3C3C43",
  },
  footer: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  count: {
    flexShrink: 1,
    fontSize: 13,
    color: "#8E8E93",
  },
  viewDetails: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0A84FF",
    flex: 1,
  },
  fallback: {
    fontSize: 15,
    color: "#111113",
  },
  fallbackMissing: {
    color: "#8E8E93",
    textDecorationLine: "line-through",
  },
  missing: {
    marginTop: 6,
    fontSize: 13,
    color: "#8E8E93",
  },
  retry: {
    marginTop: 6,
    fontSize: 13,
    color: "#0A84FF",
    fontWeight: "600",
  },
});
