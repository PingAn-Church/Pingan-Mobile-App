import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "./ThemeContext";

// Turns a style factory into a hook, so styles are built from the current
// theme instead of being fixed when the file loads. Styles are rebuilt only
// when the theme object changes, not on every render.
//
//   const useStyles = makeStyles((t) => ({
//     box: { padding: t.spacing.lg, backgroundColor: t.colors.background },
//   }));
//   const styles = useStyles();
export function makeStyles(factory) {
  return function useStyles() {
    const theme = useTheme();
    return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
  };
}
