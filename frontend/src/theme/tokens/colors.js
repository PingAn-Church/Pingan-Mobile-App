// Colour tokens for the standard theme.
// Names describe what a colour is FOR, not what it looks like, so a value can
// change later without renaming anything that uses it.
export const colors = {
  // Brand / actions
  primary: "#007AFF",
  onPrimary: "#FFFFFF", // text and icons drawn on top of `primary`
  danger: "#FF3B30",
  success: "#28A745",

  // Text
  textPrimary: "#000000", // headings and titles
  textBody: "#333333", // paragraphs
  textSecondary: "#666666", // dates, captions, empty states (5.7:1 on white)
  textDisabled: "#8A8A8A",

  // Surfaces
  background: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceSubtle: "#F8F9FA",
  border: "#CCCCCC", // input fields
  borderSubtle: "#E5E7EB", // cards
  placeholder: "#EEEEEE", // image loading background
  media: "#000000", // video player background

  // Navigation bar (kept as today until the tab colour is signed off)
  navActive: "blue",
  navInactive: "gray",

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
