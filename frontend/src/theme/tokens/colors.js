// Colour tokens for the standard theme.
// Names describe what a colour is FOR, not what it looks like, so a value can
// change later without renaming anything that uses it.
// Values match what the screens use today — the standard theme must not change.
export const colors = {
  // Brand / actions
  primary: "#007AFF",
  onPrimary: "#FFFFFF", // text and icons drawn on top of `primary`
  link: "blue", // today's Home "View all" colour; standardisation will move this to `primary`

  // Text
  textStrong: "#222222",
  textBody: "#333333",
  textSecondary: "#666666",
  textMuted: "gray",

  // Surfaces
  background: "#FFFFFF",
  backgroundAlt: "#F9F9F9",
  surfaceSubtle: "#F8F9FA",
  borderSubtle: "#EEEEEE",
  placeholder: "#DDDDDD", // image loading background
  media: "#000000", // video player background

  // Home quick-action tiles
  tiles: {
    form: "#009688",
    gifts: "#2A8068",
    website: "#4CAF50",
    youtube: "#F44336",
    consultation: "#E91E63",
    location: "#2196F3",
    phone: "#FFC107",
    email: "#673AB7",
  },
};
