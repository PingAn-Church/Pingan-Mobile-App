// Font size, weight and line-height tokens.
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
};

export const fontWeight = {
  regular: "400",
  semibold: "600",
  bold: "700",
};

// Line height as a multiple of font size.
export const lineHeight = {
  tight: 1.25, // headings and titles
  normal: 1.5, // reading text
};

const text = (size, weight, color, lh) => ({
  fontSize: size,
  fontWeight: weight,
  lineHeight: Math.round(size * lh),
  color, // name of a colour token
});

// Text styles by role.
export const textVariants = {
  pageTitle: text(fontSize["2xl"], fontWeight.bold, "textPrimary", lineHeight.tight),
  sectionTitle: text(fontSize.xl, fontWeight.bold, "textPrimary", lineHeight.tight),
  cardTitle: text(fontSize.lg, fontWeight.bold, "textPrimary", lineHeight.tight),
  cardTitleSmall: text(fontSize.md, fontWeight.bold, "textPrimary", lineHeight.tight),
  bodyLarge: text(fontSize.lg, fontWeight.regular, "textBody", lineHeight.normal),
  body: text(fontSize.md, fontWeight.regular, "textBody", lineHeight.normal),
  secondary: text(fontSize.sm, fontWeight.regular, "textSecondary", lineHeight.normal),
  caption: text(fontSize.xs, fontWeight.regular, "textSecondary", lineHeight.normal),
  // Links are single-line, so no lineHeight: on some Android phones (e.g. Samsung)
  // a fixed lineHeight on semibold text clips the last character ("View all →").
  link: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: "primary" },
};
