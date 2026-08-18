import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing, radii, typography } from '../tokens/index';

interface ChipProps {
  label: string;
  tone?: 'default' | 'dim';
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Chip({ label, tone = 'default', icon, style }: ChipProps): React.JSX.Element {
  return (
    <View style={[styles.chip, tone === 'dim' ? styles.chipDim : styles.chipDefault, style]}>
      {icon}
      <Text style={[styles.text, tone === 'dim' ? styles.textDim : styles.textDefault]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    alignSelf: 'flex-start',
  },
  chipDefault: {
    backgroundColor: colors.secondaryLight + '3D',
  },
  chipDim: {
    backgroundColor: colors.gray200,
  },
  text: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  textDefault: {
    color: colors.secondaryDark,
  },
  textDim: {
    color: colors.gray600,
  },
});
