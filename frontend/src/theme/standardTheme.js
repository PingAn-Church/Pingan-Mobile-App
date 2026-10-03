import { colors } from "./tokens/colors";
import { fontSize, fontWeight, lineHeight, textVariants } from "./tokens/typography";
import { spacing } from "./tokens/spacing";
import { radius } from "./tokens/radius";
import { shadows } from "./tokens/shadows";
import { sizes } from "./tokens/sizes";
import { components } from "./tokens/components";

// The standard theme: every token combined into one object.
// A second theme is another file with the same shape.
export const standardTheme = {
  name: "standard",
  colors,
  typography: { fontSize, fontWeight, lineHeight },
  textVariants,
  spacing,
  radius,
  shadows,
  sizes,
  components,
};
