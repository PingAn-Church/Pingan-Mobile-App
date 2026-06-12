import { TextStyle, ViewStyle, ImageStyle } from 'react-native';
import { Colors } from './Colors';

export const Typography = {
  // Font Family
  fontFamily: {
    regular: 'PlusJakartaSans-Regular',
    medium: 'PlusJakartaSans-Medium',
    semiBold: 'PlusJakartaSans-SemiBold',
    bold: 'PlusJakartaSans-Bold',
    extraBold: 'PlusJakartaSans-ExtraBold',
  },
  
  // Font Sizes
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 36,
  },
  
  // Line Heights
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.625,
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const BorderRadius = {
  none: 0,
  sm: 4,
  base: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const Shadows = {
  small: {
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  large: {
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

// Global Text Styles
export const TextStyles = {
  h1: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize['4xl'],
    lineHeight: Typography.fontSize['4xl'] * Typography.lineHeight.tight,
    color: Colors.textPrimary,
    marginBottom: Spacing.base,
  } as TextStyle,
  
  h2: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize['3xl'],
    lineHeight: Typography.fontSize['3xl'] * Typography.lineHeight.tight,
    color: Colors.textPrimary,
    marginBottom: Spacing.base,
  } as TextStyle,
  
  h3: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize['2xl'],
    lineHeight: Typography.fontSize['2xl'] * Typography.lineHeight.normal,
    color: Colors.textPrimary,
    marginBottom: Spacing.base,
  } as TextStyle,
  
  h4: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.xl,
    lineHeight: Typography.fontSize.xl * Typography.lineHeight.normal,
    color: Colors.textPrimary,
    marginBottom: Spacing.base,
  } as TextStyle,

  h5: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.lg,
    lineHeight: Typography.fontSize.lg * Typography.lineHeight.normal,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  } as TextStyle,

  body: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.base,
    lineHeight: Typography.fontSize.base * Typography.lineHeight.normal,
    color: Colors.textPrimary,
  } as TextStyle,
  
  bodyMedium: {
    fontFamily: Typography.fontFamily.medium,
    fontSize: Typography.fontSize.base,
    lineHeight: Typography.fontSize.base * Typography.lineHeight.normal,
    color: Colors.textPrimary,
  } as TextStyle,

  bodySmall: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.sm,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.normal,
    color: Colors.textPrimary,
  } as TextStyle,

  bodySmallBold: {
    fontFamily: Typography.fontFamily.bold,
    fontSize: Typography.fontSize.sm,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.normal,
    color: Colors.textPrimary,
  } as TextStyle,
  
  caption: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    lineHeight: Typography.fontSize.sm * Typography.lineHeight.normal,
    color: Colors.textSecondary,
  } as TextStyle,

  captionSmall: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    lineHeight: Typography.fontSize.xs * Typography.lineHeight.normal,
    color: Colors.textSecondary,
  } as TextStyle,
  
  small: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.xs,
    lineHeight: Typography.fontSize.xs * Typography.lineHeight.normal,
    color: Colors.textMuted,
  } as TextStyle,
} as const;

// Global Container Styles
export const ContainerStyles = {
  screen: {
    flex: 1,
    backgroundColor: Colors.primary,
  } as ViewStyle,
  
  container: {
    paddingHorizontal: Spacing.lg,
  } as ViewStyle,
  
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    ...Shadows.medium,
  } as ViewStyle,
  
  button: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  
  buttonPrimary: {
    backgroundColor: Colors.secondary,
  } as ViewStyle,
  
  buttonSecondary: {
    backgroundColor: Colors.accent,
  } as ViewStyle,
} as const;
