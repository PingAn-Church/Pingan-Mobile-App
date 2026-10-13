// Colour tokens for the standard theme.
// Names describe what a colour is FOR, not what it looks like, so a value can
// change later without renaming anything that uses it.
export const colors = {
  // Brand / actions
  primary: "#007AFF",
  onPrimary: "#FFFFFF", // text and icons drawn on top of `primary`
  danger: "#FF3B30",
  success: "#28A745",
  badge: "#EF4444", // unread / notification count bubbles

  // Text
  textPrimary: "#000000", // headings and titles
  textBody: "#333333", // paragraphs
  textSecondary: "#666666", // dates, captions, empty states (5.7:1 on white)
  textDisabled: "#8A8A8A",

  // Surfaces
  background: "#FFFFFF",
  backgroundMuted: "#F1F5F9", // screens with white panels (Chats, Settings)
  surface: "#FFFFFF",
  surfaceSubtle: "#F8F9FA",
  surfaceMuted: "#F0F0F0", // segmented tab bar background
  surfaceSelected: "#F0F8FF", // highlighted row in a pick list 
  border: "#CCCCCC", // input fields
  borderSubtle: "#E5E7EB", // cards
  placeholder: "#EEEEEE", // image loading background
  media: "#000000", // video player background
  overlay: "rgba(0, 0, 0, 0.6)", // buttons drawn on top of photos
  overlayBorder: "rgba(255, 255, 255, 0.3)",

  // Navigation bar (kept as today until the tab colour is signed off)
  navActive: "blue",
  navInactive: "gray",

  // Chat
  chat: {
    online: "#10B981", // presence dot, group online count
    mention: "#F97316", // "[@]" marker when you were mentioned
    topicsAvatar: "#0F766E", // Topics & Threads row
  },

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
