import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * A list row that slides left to show action buttons behind it, the way a chat
 * list does on a phone. One row is open at a time: dragging another closes it,
 * and a tap on an open row closes it rather than opening the chat.
 *
 * PanResponder, not gesture-handler: the app mounts no GestureHandlerRootView
 * (see ImageViewer). The web gets no swipe — a mouse drag is not a gesture
 * people expect of a list — so the row's long-press menu carries the same
 * actions there (see ConversationActionSheet).
 *
 * @param {{ actions: Array, actionWidth?: number, enabled?: boolean, children: any }} props
 *   `actions` are [{ key, label, icon, color, onPress }], drawn right to left.
 */
let closeOpenRow = null; // closes whichever row currently shows its buttons

export default function SwipeableRow({ children, actions = [], actionWidth = 72, enabled = true }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const widthRef = useRef(0);
  widthRef.current = actions.length * actionWidth;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled && widthRef.current > 0;

  const settle = useCallback(
    (to) => Animated.spring(translateX, { toValue: to, friction: 8, tension: 120, useNativeDriver: false }).start(),
    [translateX]
  );
  const close = useCallback(() => {
    openRef.current = false;
    settle(0);
    if (closeOpenRow === close) closeOpenRow = null;
  }, [settle]);
  const open = useCallback(() => {
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close;
    openRef.current = true;
    settle(-widthRef.current);
  }, [close, settle]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // An open row swallows the tap that would otherwise open the chat.
        onStartShouldSetPanResponderCapture: () => openRef.current,
        // Claim the touch only once it is clearly a horizontal drag, so the
        // list keeps scrolling and plain taps reach the row.
        onMoveShouldSetPanResponder: (_, gesture) =>
          enabledRef.current && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderGrant: () => {
          if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
        },
        onPanResponderMove: (_, gesture) => {
          const base = openRef.current ? -widthRef.current : 0;
          translateX.setValue(Math.min(0, Math.max(-widthRef.current, base + gesture.dx)));
        },
        onPanResponderRelease: (_, gesture) => {
          if (openRef.current && Math.abs(gesture.dx) < 4) {
            close(); // the swallowed tap
            return;
          }
          const base = openRef.current ? -widthRef.current : 0;
          if (base + gesture.dx < -widthRef.current / 2) open();
          else close();
        },
        onPanResponderTerminate: () => close(),
      }),
    [close, open, translateX]
  );

  useEffect(
    () => () => {
      if (closeOpenRow === close) closeOpenRow = null;
    },
    [close]
  );

  if (Platform.OS === "web" || !enabled || !actions.length) return children;

  return (
    <View style={styles.container}>
      <View style={[styles.actions, { width: widthRef.current }]}>
        {actions.map((action) => (
          <Pressable
            key={action.key}
            onPress={() => {
              close();
              action.onPress?.();
            }}
            style={[styles.action, { width: actionWidth, backgroundColor: action.color || "#8E8E93" }]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            {!!action.icon && <Ionicons name={action.icon} size={20} color="#FFFFFF" />}
            <Text style={styles.actionLabel} numberOfLines={1}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
  },
  actions: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
  },
  action: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  actionLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
});
