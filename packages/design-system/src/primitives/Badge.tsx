import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing, radii, typography } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  /** Optional theme override (`useAppTheme()`'s colors) — defaults to the
   *  legacy static `colors` look when omitted, same precedent as
   *  GlassSurface/BottomSheet/Chip/DriverListCard. A themed badge on a dark
   *  surface needs its own token-backed variant map (the legacy
   *  successLight/errorLight etc. are light-mode-only hexes, not real
   *  dark-mode colors), not the same object recolored. */
  theme?: AppPalette;
}

const variantColors: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: colors.gray200, text: colors.gray700 },
  success: { bg: colors.successLight, text: colors.successDark },
  warning: { bg: colors.warningLight, text: colors.warningDark },
  error: { bg: colors.errorLight, text: colors.errorDark },
  info: { bg: colors.infoLight, text: colors.infoDark },
};

function themedVariantColors(theme: AppPalette): Record<BadgeVariant, { bg: string; text: string }> {
  return {
    default: { bg: theme.surfaceMuted, text: theme.inkMuted },
    success: { bg: theme.accentGlow, text: theme.accentStrong },
    warning: { bg: theme.warningMuted, text: theme.warning },
    error: { bg: theme.errorMuted, text: theme.error },
    info: { bg: theme.surfaceMuted, text: theme.info },
  };
}

export function Badge({ label, variant = 'default', style, theme }: BadgeProps): React.JSX.Element {
  const palette = theme ? themedVariantColors(theme)[variant] : variantColors[variant];

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
    fontWeight: typography.fontWeight.medium,
  },
});
