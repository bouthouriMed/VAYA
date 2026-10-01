import React from 'react';
import { I18nManager, Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { typography } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';

type TextVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'body'
  | 'bodySmall'
  | 'caption'
  | 'label'
  | 'display'
  | 'displaySmall'
  | 'displayItalic'
  | 'headlineDisplay';

interface TextComponentProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  children: React.ReactNode;
}

const variantStyles: Record<TextVariant, TextStyle> = {
  h1: {
    fontSize: typography.fontSize['4xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.fontSize['4xl'] * 1.2,
  },
  h2: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.fontSize['3xl'] * 1.2,
  },
  h3: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.fontSize['2xl'] * 1.2,
  },
  // The one screen-bar title style (ScreenHeader) — every pushed screen's
  // title renders at this size so headers never drift between screens.
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.fontSize.lg * 1.3,
  },
  body: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.md * 1.5,
  },
  bodySmall: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.sm * 1.5,
  },
  caption: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.xs * 1.5,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.fontSize.sm * 1.5,
  },
  // Fraunces — reserved for the handful of moments that carry the brand's
  // voice (hero headlines, a selected driver's name, a price about to be
  // confirmed), never for dense/repeated UI copy. See tokens/typography.ts.
  display: {
    fontSize: typography.fontSize['6xl'],
    fontFamily: typography.fontFamilyDisplay.medium,
    lineHeight: typography.fontSize['6xl'] * 1.04,
    letterSpacing: -0.5,
  },
  displaySmall: {
    fontSize: typography.fontSize['4xl'],
    fontFamily: typography.fontFamilyDisplay.medium,
    lineHeight: typography.fontSize['4xl'] * 1.08,
    letterSpacing: -0.3,
  },
  displayItalic: {
    fontSize: typography.fontSize.xl,
    fontFamily: typography.fontFamilyDisplay.italic,
    lineHeight: typography.fontSize.xl * 1.35,
  },
  // A smaller, heavier Fraunces cut than `displaySmall` — a screen-title
  // moment (e.g. "Trouver un trajet") rather than a hero number, so it
  // needs semibold weight at ~27px, not medium at 36px.
  headlineDisplay: {
    fontSize: 27,
    fontFamily: typography.fontFamilyDisplay.semibold,
    lineHeight: 27 * 1.15,
    letterSpacing: -0.3,
  },
};

export function Text({
  variant = 'body',
  color,
  align,
  style,
  children,
  ...props
}: TextComponentProps): React.JSX.Element {
  // Unspecified color follows the active theme's ink, so text that never
  // passed a color still reads correctly in dark mode.
  const { colors: theme } = useAppTheme();
  return (
    <RNText
      style={[
        variantStyles[variant],
        { color: color ?? theme.ink, textAlign: align, writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr' },
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
}
