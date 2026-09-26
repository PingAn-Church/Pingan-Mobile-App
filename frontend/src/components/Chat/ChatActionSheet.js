import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import i18n from "../../../i18n";
import { getAllEvents } from "../../service/EventService";
import { formatEventDay, registrationChipFor } from "../../utils/eventDisplay";

const GRID_HEIGHT = 150;
const OPEN_MS = 260;
const CLOSE_MS = 200;

/**
 * The panel behind the composer's "+": a grid of extra things to send, and —
 * for "Event" — a second page listing upcoming events to share.
 *
 * Everything moves: the backdrop fades, the sheet rises from the bottom edge,
 * the tiles pop in one after another, and switching to the event list slides
 * the pages across while the sheet grows to fit. Closing plays it backwards
 * before the modal unmounts, so the panel never just vanishes.
 *
 * New actions go in ACTIONS below; the sticker panel is expected to join them.
 */
export default function ChatActionSheet({
  visible,
  onClose,
  onPickPhoto,
  onShareEvent,
  canPostNotice = false,
  onComposeNotice,
  language,
}) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const listHeight = Math.min(460, Math.round(screenHeight * 0.6));

  const [rendered, setRendered] = useState(visible);
  const [page, setPage] = useState("grid");
  const sheet = useRef(new Animated.Value(0)).current; // 0 hidden → 1 shown
  const pageProgress = useRef(new Animated.Value(0)).current; // 0 grid → 1 events
  // One per possible tile; extras simply animate nothing.
  const tiles = useRef(Array.from({ length: 4 }, () => new Animated.Value(0))).current;

  const [events, setEvents] = useState([]);
  const [eventsPage, setEventsPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState(false);

  // Mount first, animate second: a native-driven animation started before its
  // view exists can finish without the view ever seeing it.
  useEffect(() => {
    if (visible) {
      setRendered(true);
    } else if (rendered) {
      Animated.timing(sheet, {
        toValue: 0,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        // Reopened mid-close: the open animation interrupted this one, so the
        // sheet must stay mounted.
        if (finished) setRendered(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (visible && rendered) {
      setPage("grid");
      pageProgress.setValue(0);
      tiles.forEach((tile) => tile.setValue(0));
      Animated.parallel([
        Animated.timing(sheet, {
          toValue: 1,
          duration: OPEN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.stagger(
          60,
          tiles.map((tile) =>
            Animated.spring(tile, { toValue: 1, friction: 6, tension: 110, useNativeDriver: true })
          )
        ),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rendered]);

  const loadEvents = useCallback(
    async (nextPage = 0) => {
      setLoadingEvents(true);
      setEventsError(false);
      try {
        const response = await getAllEvents({ status: "upcoming", page: nextPage, size: 20, sort: "startAt,asc" });
        if (response?.success === false) throw new Error("load failed");
        const items = Array.isArray(response?.data) ? response.data : [];
        setEvents((prev) =>
          nextPage === 0 ? items : [...prev, ...items.filter((item) => !prev.some((p) => p.id === item.id))]
        );
        setEventsPage(nextPage);
        setHasMore(Boolean(response?.pagination?.hasMore));
      } catch (error) {
        setEventsError(true);
      } finally {
        setLoadingEvents(false);
      }
    },
    []
  );

  const goTo = (target) => {
    setPage(target);
    if (target === "events") loadEvents(0);
    Animated.timing(pageProgress, {
      toValue: target === "events" ? 1 : 0,
      duration: 240,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  // Photo first closes the sheet: the image picker is its own full-screen view
  // and should not open on top of a half-dismissed panel.
  const actions = [
    { key: "photo", icon: "image", tint: "#34C759", label: i18n.t("chatActionPhoto"), onPress: () => onPickPhoto?.() },
    { key: "event", icon: "calendar", tint: "#FF9500", label: i18n.t("chatActionEvent"), onPress: () => goTo("events") },
    // Group admins only: the next message they send is pinned as the notice.
    ...(canPostNotice
      ? [{ key: "notice", icon: "pin", tint: "#B26A00", label: i18n.t("chatActionNotice"), onPress: () => onComposeNotice?.() }]
      : []),
  ];

  if (!rendered) return null;

  const sheetTranslate = sheet.interpolate({ inputRange: [0, 1], outputRange: [listHeight + 80, 0] });
  const bodyHeight = pageProgress.interpolate({ inputRange: [0, 1], outputRange: [GRID_HEIGHT, listHeight] });
  const gridStyle = {
    opacity: pageProgress.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: "clamp" }),
    transform: [{ translateX: pageProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) }],
  };
  const listStyle = {
    opacity: pageProgress.interpolate({ inputRange: [0.3, 1], outputRange: [0, 1], extrapolate: "clamp" }),
    transform: [{ translateX: pageProgress.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }],
  };

  const renderEvent = ({ item }) => {
    const chip = registrationChipFor(item);
    return (
      <TouchableOpacity style={styles.eventRow} onPress={() => onShareEvent?.(item)} activeOpacity={0.7}>
        <View style={styles.eventDate}>
          <Ionicons name="calendar-outline" size={20} color="#FF9500" />
        </View>
        <View style={styles.eventText}>
          <Text style={styles.eventTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.eventMeta} numberOfLines={1}>
            {[formatEventDay(item.date, language), item.startTime, item.location].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {chip && (
          <View style={[styles.chip, styles[`chip_${chip.tone}`]]}>
            <Text style={[styles.chipText, styles[`chipText_${chip.tone}`]]}>{chip.label}</Text>
          </View>
        )}
        <Ionicons name="paper-plane-outline" size={18} color="#0A84FF" style={styles.sendHint} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={page === "events" ? () => goTo("grid") : onClose}>
      <Animated.View style={[styles.backdrop, { opacity: sheet }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={i18n.t("close")} />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 10, transform: [{ translateY: sheetTranslate }] }]}
      >
        <View style={styles.grabber} />

        <View style={styles.header}>
          {page === "events" ? (
            <TouchableOpacity onPress={() => goTo("grid")} style={styles.headerButton} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color="#0A84FF" />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerButton} />
          )}
          <Text style={styles.headerTitle}>
            {page === "events" ? i18n.t("shareEvent") : i18n.t("chatMoreActions")}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.headerButton} hitSlop={8}>
            <Ionicons name="close" size={22} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.body, { height: bodyHeight }]}>
          <Animated.View
            style={[styles.page, gridStyle]}
            pointerEvents={page === "grid" ? "auto" : "none"}
          >
            <View style={styles.grid}>
              {actions.map((action, index) => (
                <Animated.View
                  key={action.key}
                  style={{
                    opacity: tiles[index],
                    transform: [
                      { scale: tiles[index].interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                      { translateY: tiles[index].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                    ],
                  }}
                >
                  <Pressable
                    onPress={action.onPress}
                    style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                  >
                    <View style={[styles.tileIcon, { backgroundColor: action.tint }]}>
                      <Ionicons name={action.icon} size={26} color="#FFFFFF" />
                    </View>
                    <Text style={styles.tileLabel}>{action.label}</Text>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </Animated.View>

          <Animated.View
            style={[styles.page, listStyle]}
            pointerEvents={page === "events" ? "auto" : "none"}
          >
            {page === "events" && (
              <FlatList
                data={events}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderEvent}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                onEndReached={() => {
                  if (!loadingEvents && hasMore && events.length > 0) loadEvents(eventsPage + 1);
                }}
                onEndReachedThreshold={0.4}
                ListFooterComponent={
                  loadingEvents ? <ActivityIndicator style={styles.spinner} color="#8E8E93" /> : null
                }
                ListEmptyComponent={
                  loadingEvents ? null : eventsError ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyText}>{i18n.t("loadActivityFailed")}</Text>
                      <TouchableOpacity onPress={() => loadEvents(0)} style={styles.retry}>
                        <Text style={styles.retryText}>{i18n.t("tryAgain")}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={[styles.emptyText, styles.emptyState]}>{i18n.t("shareEventEmpty")}</Text>
                  )
                }
              />
            )}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 16,
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D1D1D6",
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerButton: {
    width: 36,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#111113",
  },
  body: {
    overflow: "hidden",
  },
  page: {
    ...StyleSheet.absoluteFillObject,
  },
  grid: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 22,
  },
  tile: {
    alignItems: "center",
    width: 72,
    borderRadius: 14,
    paddingVertical: 6,
  },
  tilePressed: {
    backgroundColor: "#F2F2F7",
  },
  tileIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    marginTop: 8,
    fontSize: 14,
    color: "#3C3C43",
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  eventDate: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFF4E5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  eventText: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111113",
  },
  eventMeta: {
    marginTop: 2,
    fontSize: 13,
    color: "#8E8E93",
  },
  chip: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chip_open: { backgroundColor: "#E5F0FF" },
  chip_done: { backgroundColor: "#E3F7E8" },
  chip_muted: { backgroundColor: "#EEEEF0" },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipText_open: { color: "#0A84FF" },
  chipText_done: { color: "#1F9D44" },
  chipText_muted: { color: "#8E8E93" },
  sendHint: {
    marginLeft: 10,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E5EA",
    marginLeft: 68,
  },
  spinner: {
    marginVertical: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 15,
    color: "#8E8E93",
  },
  retry: {
    marginTop: 12,
    backgroundColor: "#0A84FF",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
