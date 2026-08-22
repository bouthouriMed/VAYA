import { Platform, StyleSheet } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
});

// Fraunces — a warm, soft-edged editorial serif that matches VAYA's brand
// character (navy/sage/cream, generous radii) far more than the system
// grotesk. Loaded once at the app root (apps/mobile/app/_layout.tsx) via
// @expo-google-fonts/fraunces; these are the registered font-family names
// RN resolves by string, so referencing them here is safe even before the
// app has loaded them (RN silently falls back to the system font for an
// unregistered family name — see Text.tsx's `display*` variants).
export const fontFamilyDisplay = {
  regular: 'Fraunces_400Regular',
  medium: 'Fraunces_500Medium',
  semibold: 'Fraunces_600SemiBold',
  italic: 'Fraunces_500Medium_Italic',
} as const;

export const typography = {
  fontFamily,
  fontFamilyDisplay,
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 44,
    '6xl': 56,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const textStyles = StyleSheet.create({
  h1: {
    fontSize: typography.fontSize['4xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.fontSize['4xl'] * typography.lineHeight.tight,
    fontFamily,
  },
  h2: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.fontSize['3xl'] * typography.lineHeight.tight,
    fontFamily,
  },
  h3: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.fontSize['2xl'] * typography.lineHeight.tight,
    fontFamily,
  },
  body: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.md * typography.lineHeight.normal,
    fontFamily,
  },
  bodySmall: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
    fontFamily,
  },
  caption: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.xs * typography.lineHeight.normal,
    fontFamily,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
    fontFamily,
  },
});

export type FontSizeToken = keyof typeof typography.fontSize;
