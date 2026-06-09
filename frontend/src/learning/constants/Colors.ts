export const Colors = {
  // Purple Palette (Primary Brand Colors)
  purple150: '#C9C6EC',
  purple200: '#EADDF6',
  purple300: '#9E9EBA',
  purple400: '#564BEB', // Primary Purple
  purple600: '#943FE4', // Secondary Purple
  purple850: '#3A339F', // Dark Purple
  
  // Gray Palette (Neutrals)
  backgroundGray: '#2F2F37', // Card backgrounds
  gray200: '#D4D4D4',       // Light text/borders
  gray500: '#636363',       // Medium text
  gray600: '#363535ff',
  gray800: '#2E2E2E',       // Dark elements
  textInputBg: '#3E3E47',
  
  // Status Colors
  yellow: '#EEC53D',    // Achievements, warnings
  green: '#49AC33',     // Success states
  red: '#ED1B1B',       // Errors, notifications
  blue: '#3B82F6',      // Info states
  
  // Base Colors
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  
  // Semantic Color Names (matching design system)
  primary: '#2F2F37',        // Main background
  secondary: '#564BEB',      // Primary purple
  accent: '#943FE4',         // Secondary purple
  surface: '#3A339F',        // Card/surface backgrounds
  
  // Text Colors (semantic)
  textPrimary: '#FFFFFF',    // Main text on dark backgrounds
  textSecondary: '#D4D4D4',  // Secondary text
  textMuted: '#636363',      // Muted/disabled text
  textWarning: '#ff6b6b',    // Warning text
  
  // Interactive Colors
  cardBackground: '#3A339F',
  cardBorder: '#564BEB',
  
  // Component-specific colors for exact design matching
  streakFire: '#FF6B35',     // Fire icon color
  starGold: '#FFD700',       // Star/rating color
  notificationRed: '#ef4444', // Notification badge
  
  // Achievement card specific colors
  streakCardBg: '#564BEB',   // 12 Day Streak card
  certificateCardBg: '#EEC53D', // 3 Certificates card
  
  // Additional UI Colors
  loadingBackdrop: '#1f2937',    // Loading state backdrop
  cardDark: '#0E0F15',           // Dark card background
  progressTrack: '#D1D5DB',      // Progress bar track
  progressFill: '#4F46E5',       // Progress bar fill
  overlay: 'rgba(0,0,0,0.7)',    // Dark overlay for text on images

  categoryDefault: '#ec4899',    // Default category color
} as const;

export type ColorKeys = keyof typeof Colors;
