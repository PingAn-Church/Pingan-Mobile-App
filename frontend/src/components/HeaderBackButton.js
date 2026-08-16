import React from "react";
import { TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

/**
 * Header back control that ALWAYS provides an exit.
 *
 * Native-stack only renders its automatic back button when the screen has a
 * previous route. On web a URL-addressable screen can be loaded/refreshed as the
 * stack root (nothing behind it), so there'd be no back button and browser-back is
 * also at the entry — leaving the user stuck. This walks the back stack when it can,
 * and otherwise falls back to a sensible parent route.
 *
 * `fallbackRoute` is a route name, or `{ name, params }` when the destination is
 * a screen nested inside a navigator — landing on the tab bar's default tab
 * would otherwise drop someone somewhere unrelated to where they were.
 */
export default function HeaderBackButton({ navigation: navigationProp, fallbackRoute = "HomeTabs", tintColor }) {
  const contextNavigation = useNavigation();
  const navigation = navigationProp || contextNavigation;

  const onPress = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else if (typeof fallbackRoute === "string") {
      navigation.navigate(fallbackRoute);
    } else {
      navigation.navigate(fallbackRoute.name, fallbackRoute.params);
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{ paddingVertical: 4, paddingRight: 12, paddingLeft: Platform.OS === "web" ? 8 : 0 }}
    >
      <Ionicons name="chevron-back" size={26} color={tintColor || "#007aff"} />
    </TouchableOpacity>
  );
}
