import React, { useEffect, useRef } from "react";
import {
  View,
  Animated,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import i18n from "../../i18n";

// The dove animation. The WebP is encoded with a loop count of 1, so it plays
// through once and holds on the final frame — no runtime "play once" flag is
// needed (expo-image and the browser both honour the file's loop metadata).
const entryAnimation = require("../../assets/entry.webp");

// Matches the background baked into entry.webp so the WebP canvas and the
// screen behind it are a single seamless field of colour.
const BRAND_BG = "#42ADC6";

// entry.webp is 48 frames at ~33ms ≈ 1.6s. Bring the wordmark in as the dove
// settles rather than at t=0, so the two animations don't compete.
const TEXT_FADE_DELAY = 1250;
const TEXT_FADE_DURATION = 600;

/**
 * Branded loading/entry screen shown while the app resolves the stored session.
 * Replaces the bare ActivityIndicator. Works on native (expo-image decodes the
 * animated WebP) and on web (the browser plays it in an <img>).
 */
export default function EntryScreen() {
  const { width, height } = useWindowDimensions();
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;

  // Size to the smaller screen edge so the dove stays centred and unclipped on
  // tall phones and wide desktop browser windows alike; cap it so it doesn't
  // grow oversized on large screens.
  const logoSize = Math.min(Math.min(width, height) * 0.45, 300);

  useEffect(() => {
    const animation = Animated.timing(wordmarkOpacity, {
      toValue: 1,
      delay: TEXT_FADE_DELAY,
      duration: TEXT_FADE_DURATION,
      // Opacity is native-drivable on iOS/Android; react-native-web ignores
      // the flag, so guard it to avoid a dev warning on web.
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [wordmarkOpacity]);

  return (
    <View style={styles.container}>
      <Image
        source={entryAnimation}
        style={{ width: logoSize, height: logoSize }}
        contentFit="contain"
        // Skip the fade-in cross-dissolve so the first dove frame is exact.
        transition={0}
        cachePolicy="memory-disk"
        accessibilityLabel={i18n.t("churchName")}
      />
      <Animated.Text style={[styles.wordmark, { opacity: wordmarkOpacity }]}>
        {i18n.t("churchName")}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BRAND_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  // Anchored in the lower third so the dove stays optically centred above it.
  wordmark: {
    position: "absolute",
    bottom: "20%",
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: 0.5,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
