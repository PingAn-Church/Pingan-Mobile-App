import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
// A press that neither moves far nor lasts long is a tap to dismiss, not the
// start of a pan. Generous enough to survive the wobble of a real finger.
const TAP_SLOP = 12;
const TAP_MS = 250;

const distanceBetween = (touches) => {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Full-screen photo view for a chat image.
 *
 * Tapping anywhere that is not an action button closes it, so the whole backdrop
 * — including the photo — is a dismiss target. Two fingers pinch to zoom, and one
 * finger pans once zoomed in; while zoomed, a single finger drags the photo
 * rather than dismissing, otherwise panning would be impossible.
 *
 * Gestures run through PanResponder rather than react-native-gesture-handler:
 * GestureDetector needs a GestureHandlerRootView at the app root, which this app
 * does not mount, and adding one changes touch handling everywhere. PanResponder
 * is built in and keeps the whole feature inside this component.
 */
export default function ImageViewer({ visible, uri, actions = [], onClose }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Committed transform between gestures — Animated.Value has no readable
  // "current" we can safely branch on mid-gesture.
  const committed = useRef({ scale: 1, x: 0, y: 0 });
  const gesture = useRef({ startDistance: 0, startX: 0, startY: 0, startedAt: 0, pinching: false });

  const [zoomed, setZoomed] = useState(false);

  const reset = () => {
    committed.current = { scale: 1, x: 0, y: 0 };
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    setZoomed(false);
  };

  const springHome = () => {
    committed.current = { scale: 1, x: 0, y: 0 };
    setZoomed(false);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 0 }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }),
    ]).start();
  };

  // The action buttons close through the parent rather than through close(), so
  // resetting here is what guarantees the next photo opens unzoomed whichever way
  // the last one was dismissed.
  useEffect(() => {
    if (!visible) reset();
    // reset only touches refs and Animated values, all stable for the component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Read through a ref: the PanResponder below is built once, so calling the
  // prop directly would pin whichever onClose the first render happened to pass.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = () => {
    reset();
    onCloseRef.current?.();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches;
          gesture.current.startedAt = Date.now();
          gesture.current.pinching = touches.length >= 2;
          gesture.current.startDistance = touches.length >= 2 ? distanceBetween(touches) : 0;
          gesture.current.startX = committed.current.x;
          gesture.current.startY = committed.current.y;
        },

        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches;

          if (touches.length >= 2) {
            // A second finger can land after the gesture began, so seed the
            // baseline the first time we see one rather than only on grant.
            if (!gesture.current.pinching) {
              gesture.current.pinching = true;
              gesture.current.startDistance = distanceBetween(touches);
              gesture.current.startX = committed.current.x;
              gesture.current.startY = committed.current.y;
            }

            const ratio = distanceBetween(touches) / (gesture.current.startDistance || 1);
            scale.setValue(clamp(committed.current.scale * ratio, MIN_SCALE, MAX_SCALE));
            return;
          }

          // One finger only pans a zoomed photo. At natural size the drag is
          // left alone so the release can be read as a dismissing tap.
          if (committed.current.scale > 1) {
            translateX.setValue(gesture.current.startX + gestureState.dx);
            translateY.setValue(gesture.current.startY + gestureState.dy);
          }
        },

        onPanResponderRelease: (event, gestureState) => {
          const wasPinching = gesture.current.pinching;
          gesture.current.pinching = false;

          if (wasPinching) {
            // Commit whatever the pinch settled on, and fall back to fitting the
            // screen if it ended below natural size.
            scale.stopAnimation((value) => {
              if (value <= MIN_SCALE + 0.01) {
                springHome();
                return;
              }
              committed.current.scale = value;
              setZoomed(true);
            });
            return;
          }

          if (committed.current.scale > 1) {
            committed.current.x = gesture.current.startX + gestureState.dx;
            committed.current.y = gesture.current.startY + gestureState.dy;
            return;
          }

          const travelled = Math.hypot(gestureState.dx, gestureState.dy);
          const quick = Date.now() - gesture.current.startedAt < TAP_MS;
          if (travelled < TAP_SLOP && quick) close();
        },

        onPanResponderTerminationRequest: () => false,
      }),
    // Values and refs are stable for the component's life, so this is built once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  if (!visible || !uri) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.root}>
        <Animated.View
          style={[
            styles.stage,
            { transform: [{ translateX }, { translateY }, { scale }] },
          ]}
          {...panResponder.panHandlers}
        >
          <Image
            source={{ uri }}
            style={{ width: screenWidth, height: screenHeight }}
            resizeMode="contain"
          />
        </Animated.View>

        {actions.length > 0 && (
          // Rendered after the stage so its touches win, which is what makes
          // "tap anywhere else to close" safe to apply to the whole backdrop.
          <View style={styles.actionBar}>
            {actions.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={styles.action}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={action.icon}
                  size={24}
                  color={action.destructive ? "#FF6B6B" : "#FFFFFF"}
                />
                <Text
                  style={[styles.actionText, action.destructive ? styles.actionTextDanger : null]}
                  numberOfLines={1}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {zoomed && (
          <TouchableOpacity style={styles.resetHint} onPress={springHome} activeOpacity={0.8}>
            <Ionicons name="contract-outline" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.94)",
  },
  stage: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 14,
    // Clears the gesture bar / home indicator.
    paddingBottom: 34,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  action: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  actionText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  actionTextDanger: {
    color: "#FF6B6B",
  },
  resetHint: {
    position: "absolute",
    top: 48,
    right: 18,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
});
