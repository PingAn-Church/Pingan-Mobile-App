import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { STICKERS, stickerLabel } from "../../utils/stickers";

const COLUMNS = 4;
const H_PADDING = 14;
const V_PADDING = 12;
const MAX_CELL = 96;
const OPEN_MS = 220;
const CLOSE_MS = 170;

const cellSize = (windowWidth) =>
  Math.min(MAX_CELL, Math.floor((windowWidth - H_PADDING * 2) / COLUMNS));

/**
 * How tall the open panel is in a window this wide. The chat page needs it to
 * lift whatever floats above the composer by the same amount.
 */
export const stickerPanelHeight = (windowWidth) =>
  Math.ceil(STICKERS.length / COLUMNS) * cellSize(windowWidth) + V_PADDING * 2;

/** One sticker in the panel: pops in on open, dips when pressed. */
function StickerTile({ sticker, size, appear, disabled, onPress }) {
  const press = useRef(new Animated.Value(1)).current;
  const pressTo = (toValue) =>
    Animated.spring(press, { toValue, friction: 5, tension: 200, useNativeDriver: true }).start();

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        opacity: appear,
        transform: [
          { scale: Animated.multiply(press, appear.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] })) },
        ],
      }}
    >
      <Pressable
        onPress={() => onPress(sticker)}
        onPressIn={() => pressTo(0.86)}
        onPressOut={() => pressTo(1)}
        disabled={disabled}
        style={styles.tile}
        accessibilityRole="button"
        accessibilityLabel={stickerLabel(sticker)}
      >
        <Image source={sticker.source} style={styles.tileImage} resizeMode="contain" />
      </Pressable>
    </Animated.View>
  );
}

/**
 * The sticker panel: a 4 x 2 grid that opens in place under the composer, where
 * the keyboard would be, so the conversation stays in view and a sticker is
 * seen to land in it. Tapping one sends it and leaves the panel open for the
 * next; the composer's sticker button (or focusing the text box) closes it.
 *
 * In the layout, not over it: the panel has real height, so the message list
 * above shrinks to make room exactly as it does for the keyboard. It grows and
 * shrinks rather than appearing, and the stickers pop in one after another.
 */
export default function StickerPanel({ visible, disabled = false, onSend }) {
  const { width } = useWindowDimensions();
  const cell = cellSize(width);
  const rows = Math.ceil(STICKERS.length / COLUMNS);
  const height = stickerPanelHeight(width);

  const [rendered, setRendered] = useState(visible);
  const open = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const tiles = useRef(STICKERS.map(() => new Animated.Value(visible ? 1 : 0))).current;

  // Mount first, animate second: a native-driven animation started before its
  // view exists can finish without the view ever seeing it.
  useEffect(() => {
    if (visible) {
      setRendered(true);
    } else if (rendered) {
      Animated.timing(open, {
        toValue: 0,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }).start(({ finished }) => {
        // Reopened mid-close: the opening animation took over, stay mounted.
        if (finished) setRendered(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!(visible && rendered)) return;
    tiles.forEach((tile) => tile.setValue(0));
    Animated.parallel([
      Animated.timing(open, {
        toValue: 1,
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.stagger(
        30,
        tiles.map((tile) =>
          Animated.spring(tile, { toValue: 1, friction: 6, tension: 130, useNativeDriver: true })
        )
      ),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rendered]);

  if (!rendered) return null;

  return (
    <Animated.View
      style={[
        styles.panel,
        {
          height: open.interpolate({ inputRange: [0, 1], outputRange: [0, height] }),
          opacity: open,
        },
      ]}
    >
      <View style={[styles.grid, { width: cell * COLUMNS, height: rows * cell }]}>
        {STICKERS.map((sticker, index) => (
          <StickerTile
            key={sticker.id}
            sticker={sticker}
            size={cell}
            appear={tiles[index]}
            disabled={disabled || !visible}
            onPress={onSend}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#F2F2F7",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D1D1D6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  tileImage: {
    width: "82%",
    height: "82%",
  },
});
