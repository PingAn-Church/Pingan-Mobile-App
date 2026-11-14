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
  surfaceMuted: "#F0F0F0", // segmented tab bar background
  border: "#CCCCCC", // input fields
  borderSubtle: "#E5E7EB", // cards
  placeholder: "#EEEEEE", // image loading background
  media: "#000000", // video player background
  overlay: "rgba(0, 0, 0, 0.6)", // buttons drawn on top of photos
  overlayBorder: "rgba(255, 255, 255, 0.3)",

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

  // Courses (learning) screens keep their own dark look. Same values as
  // src/learning/constants/Colors.ts, which the instructor screens still use.
  learning: {
    background: "#2F2F37", // screen background
    surface: "#2F2F37", // cards, chips, inputs on the list screens
    surfaceAccent: "#3A339F", // highlighted cards
    input: "#3E3E47", // text inputs
    placeholder: "#2E2E2E", // image loading background
    accent: "#564BEB", // buttons, active chips, links
    onAccent: "#FFFFFF", // text and icons on `accent`
    text: "#FFFFFF",
    textSecondary: "#D4D4D4",
    textMuted: "#636363",
    star: "#FFD700",
    success: "#49AC33",
    danger: "#ED1B1B",
    info: "#3B82F6",
    streak: "#FF6B35",
    progressTrack: "#D1D5DB",
    progressFill: "#4F46E5",
    media: "#000000", // video player background
    overlay: "rgba(0, 0, 0, 0.4)", // buttons drawn on top of images
  },
};
