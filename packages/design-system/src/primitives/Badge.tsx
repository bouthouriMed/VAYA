import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing, radii, typography } from '../tokens/index';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

const variantColors: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: colors.gray200, text: colors.gray700 },
  success: { bg: colors.successLight, text: colors.successDark },
  warning: { bg: colors.warningLight, text: colors.warningDark },
  error: { bg: colors.errorLight, text: colors.errorDark },
  info: { bg: colors.infoLight, text: colors.infoDark },
};

export function Badge({ label, variant = 'default', style }: BadgeProps): React.JSX.Element {
  const palette = variantColors[variant];

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }, style]}>
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
