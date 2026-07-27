const { withAndroidStyles } = require("expo/config-plugins");

const APP_THEME = "AppTheme";
const LIGHT_PARENT = "Theme.AppCompat.Light.NoActionBar";
const FORCE_DARK = "android:forceDarkAllowed";

/**
 * Pins the Android theme to light and opts out of force-dark.
 *
 * The app is light-only — iOS gets there via UIUserInterfaceStyle=Light, but on
 * Android `expo-system-ui` only writes the `expo_system_ui_user_interface_style`
 * string resource, which the JS layer reads at runtime. It leaves the native
 * theme on `Theme.AppCompat.DayNight` with force-dark allowed, so system dark
 * mode and battery saver still re-tint views before JS ever runs.
 *
 * This used to be a hand-edit in `android/.../values/styles.xml`, which
 * `expo prebuild --clean` silently reverted. Expressing it as a plugin means
 * the theme is regenerated correctly every time.
 *
 * Edits the generated AppTheme in place rather than using
 * AndroidConfig.Styles.assignStylesValue — that helper matches on the
 * {name, parent} pair, so a differing parent makes it append a second
 * <style name="AppTheme"> block instead of retargeting the existing one.
 */
module.exports = function withAndroidLightTheme(config) {
  return withAndroidStyles(config, (cfg) => {
    const appTheme = (cfg.modResults?.resources?.style ?? []).find(
      (style) => style?.$?.name === APP_THEME
    );

    if (!appTheme) {
      throw new Error(
        `withAndroidLightTheme: no <style name="${APP_THEME}"> in the generated styles.xml`
      );
    }

    appTheme.$.parent = LIGHT_PARENT;
    appTheme.item = [
      ...(appTheme.item ?? []).filter((item) => item?.$?.name !== FORCE_DARK),
      { _: "false", $: { name: FORCE_DARK } },
    ];

    return cfg;
  });
};
