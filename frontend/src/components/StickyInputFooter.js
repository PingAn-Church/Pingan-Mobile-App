import React from "react";
import { Platform, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Pins a bottom input bar above the Android system navigation bar.
 *
 * The app runs edge-to-edge on Android (mandatory on current Expo SDKs), so a
 * composer laid out at the bottom of the screen is drawn BEHIND the 3-button
 * navigation bar — visible but untouchable, which is why affected users could
 * not tap the message input at all. This wraps the bar in the app's
 * KeyboardStickyView and adds a strip the height of the bottom inset under it,
 * painted in the bar's own background colour so the area behind the nav buttons
 * reads as part of the bar rather than a hole.
 *
 * When the keyboard opens, the sticky view is shifted back DOWN by that same
 * inset (offset.opened — KeyboardStickyView translates by `height + offset`, and
 * keyboard height already spans from the screen edge), so the input hugs the
 * keyboard instead of floating an inset-sized gap above it; the strip slides
 * behind the keyboard. Gesture-nav devices report a small inset and get a
 * matching small strip.
 *
 * iOS and web render children untouched: iOS keeps its SafeAreaView +
 * KeyboardAvoidingView behaviour, and web has no system bar.
 */
export default function StickyInputFooter({ children, background }) {
  const insets = useSafeAreaInsets();

  if (Platform.OS !== "android") {
    return children;
  }

  return (
    <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
      {children}
      <View style={{ height: insets.bottom, backgroundColor: background }} />
    </KeyboardStickyView>
  );
}
