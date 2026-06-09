export { Colors, type ColorKeys } from "./Colors";
export {
  Typography,
  Spacing,
  BorderRadius,
  Shadows,
  TextStyles,
  ContainerStyles,
} from "./GlobalStyles";

// App constants. In Pingan, admin/instructor status comes from the user role
// flags (user.admin / user.instructor); ADMIN_EMAIL is kept for compatibility
// with ported source screens and read from the Expo config extra when present.
import Constants from "expo-constants";

const extra =
  (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ||
  ((Constants as any).manifest?.extra as Record<string, unknown> | undefined) ||
  {};

export const ADMIN_EMAIL = String(extra.ADMIN_EMAIL || "");
