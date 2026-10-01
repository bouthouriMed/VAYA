import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { spacing, radii, typography } from '../tokens/index';
import type { AppPalette } from '../theme/palette';
import { useAppTheme } from '../theme/AppThemeProvider';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  /** Overrides the theme from context — only for a screen pinned to one palette. */
  theme?: AppPalette;
}

function variantColors(theme: AppPalette): Record<BadgeVariant, { bg: string; text: string }> {
  return {
    default: { bg: theme.surfaceMuted, text: theme.inkMuted },
    success: { bg: theme.accentGlow, text: theme.accentStrong },
    warning: { bg: theme.warningMuted, text: theme.warning },
    error: { bg: theme.errorMuted, text: theme.error },
    info: { bg: theme.surfaceMuted, text: theme.info },
  };
}

/** The one status pill — every booking/ride/trip status renders through this. */
export function Badge({ label, variant = 'default', style, theme: themeOverride }: BadgeProps): React.JSX.Element {
  const { colors: contextTheme } = useAppTheme();
  const palette = variantColors(themeOverride ?? contextTheme)[variant];

  return (
    <View
      style={[styles.badge, { backgroundColor: palette.bg }, style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Text style={[styles.text, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
});
