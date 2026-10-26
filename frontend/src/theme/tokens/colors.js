// Colour tokens for the standard theme.
// Names describe what a colour is FOR, not what it looks like, so a value can
// change later without renaming anything that uses it.
export const colors = {
  // Brand / actions
  primary: "#007AFF",
  onPrimary: "#FFFFFF", // text and icons drawn on top of `primary`
  danger: "#FF3B30",
  neutral: "#808080", // less important action next to a primary one (Cancel, Back)
  success: "#28A745",
  badge: "#EF4444", // unread / notification count bubbles

  // Text
  textPrimary: "#000000", // headings, titles and the main line of a list row
  textBody: "#333333", // paragraphs
  textSecondary: "#666666", // dates, captions, empty states, status notes, low-emphasis icons (5.7:1 on white)
  textDisabled: "#8A8A8A",

  // Surfaces
  background: "#FFFFFF",
  backgroundMuted: "#F1F5F9", // screens with white panels (Chats, Settings)
  surface: "#FFFFFF",
  surfaceSubtle: "#F8F9FA", // light panel set apart from its surroundings: bottom bars, composers, subtle cards, profile rows
  surfaceMuted: "#F0F0F0", // grey band, chip or track: segmented tab track, chat editing / blocked banners, empty part of a progress bar or slider rail
  surfaceControlMuted: "#E7E7EA", // grey fill of a low-emphasis icon button (web details close ✕, chat attach 📎)
  surfaceSelected: "#F0F8FF", // highlighted row: picked in a pick list, or the chat that's open
  surfaceDisabled: "#C4C8D0", // background of a disabled button (chat send button with nothing to send)
  surfaceTinted: "#F2F7FF", // pale brand blue behind blue text or icons (secondary buttons, badges)
  inputFilled: "#F1F5F9", // background of filled inputs (search boxes, thread title/content)
  border: "#CCCCCC", // input fields
  borderSubtle: "#E5E7EB", // dividers between rows, panel and bar edges, card outlines
  borderTinted: "#CFE2FF", // pale blue edge: surfaceTinted elements (cover buttons), your own chat photos
  placeholder: "#EEEEEE", // image loading background
  media: "#000000", // video player background
  overlay: "rgba(0, 0, 0, 0.6)", // buttons drawn on top of photos
  overlayBorder: "rgba(255, 255, 255, 0.3)", // pale edge of something drawn on a photo or a coloured bubble

  // Navigation bar (kept as today until the tab colour is signed off)
  navActive: "blue",
  navInactive: "gray",

  // Chat
  chat: {
    online: "#10B981", // presence dot, group online count
    mention: "#F97316", // "[@]" marker when you were mentioned, @names in messages
    timestampSent: "rgba(255,255,255,0.82)", // time and status in your own (primary) bubble: softer than the message text
    mentionInSent: "#FFE8C7", // @name inside your own (primary) bubble: pale so it reads on blue
    topicsAvatar: "#0F766E", // Topics & Threads row
    assistantBadge: "#E7E3FF", // background of the "AI" tag beside the assistant's name
    assistantBadgeText: "#5B4BD6", // text of the "AI" tag
    bubbleReceived: "#E9E9EB", // other people's message bubbles (yours use primary)
    dateChip: "#E9E9EB", // date label between days of messages: a grey chip on the grey chat background
    composerInput: "#E7E7EA", // the message box in the chat composer: a filled input on the grey composer bar
    voiceCardSent: "rgba(255,255,255,0.14)", // faint panel behind the voice player in your own (primary) bubble
    translationDivider: "rgba(0,0,0,0.1)", // line above a translation inside a bubble: a darker tint of either bubble
  },

  // Role badges on a member's profile
  roles: {
    verified: "#10B981",
    admin: "#3B82F6",
    instructor: "#8B5CF6",
  },

  // Threads
  thread: {
    following: "#F59E0B", // bell when you follow a topic
    notFollowing: "#9CA3AF", // bell when you don't
  },

  // Storage settings
  storage: {
    notice: "#FFF6DA", // background of the web-only "caching is mobile-only" notice
    noticeText: "#8A6D00", // its text
    clearBorder: "#F0C0C0", // pale red outline of the Clear Cache button
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
