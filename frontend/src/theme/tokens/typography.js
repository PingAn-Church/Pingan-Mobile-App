// Font size and weight tokens.
// The size scale lists the sizes the migrated screens use today. Once the
// standard values are agreed, the in-between steps will be removed.
export const fontSize = {
  sm: 13,
  md: 14,
  base: 15,
  lg: 16,
  xl: 17,
  "2xl": 22,
};

export const fontWeight = {
  regular: "400",
  semibold: "600",
  bold: "700",
};

// Text styles by role. `color` is the name of a colour token.
export const textVariants = {
  sectionTitle: { fontSize: fontSize["2xl"], fontWeight: fontWeight.bold, color: "textBody" },
  cardTitle: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: "textStrong" },
  cardTitleSmall: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: "textStrong" },
  bodyStrong: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: "textBody", lineHeight: 22 },
  caption: { fontSize: fontSize.md, color: "textSecondary" },
  captionSmall: { fontSize: fontSize.sm, color: "textSecondary" },
  empty: { fontSize: fontSize.lg, color: "textMuted" },
  link: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: "link" },
};
