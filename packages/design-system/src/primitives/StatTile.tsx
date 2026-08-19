import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radii, typography, elevation } from '../tokens/index';

interface StatTileProps {
  /** Consumer-supplied icon element — keeps the design system decoupled from any one icon library. */
  icon?: React.ReactNode;
  label: string;
  value: string;
}

export function StatTile({ icon, label, value }: StatTileProps): React.JSX.Element {
  return (
    <View
      style={[styles.tile, elevation?.sm]}
      accessible
      accessibilityLabel={`${value} ${label}`}
    >
      {icon}
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 2,
    shadowColor: colors.gray900,
  },
  value: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray900,
  },
  label: {
    fontSize: 10,
    color: colors.gray600,
  },
});
