import { colors } from "./tokens/colors";
import { fontSize, fontWeight, textVariants } from "./tokens/typography";
import { spacing } from "./tokens/spacing";
import { radius } from "./tokens/radius";
import { shadows } from "./tokens/shadows";
import { components } from "./tokens/components";

// The standard theme: every token combined into one object.
// A second theme is another file with the same shape.
export const standardTheme = {
  name: "standard",
  colors,
  typography: { fontSize, fontWeight },
  textVariants,
  spacing,
  radius,
  shadows,
  components,
};
