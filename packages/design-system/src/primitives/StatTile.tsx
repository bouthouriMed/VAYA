import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, radii, typography } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';

interface StatTileProps {
  /** Consumer-supplied icon element — keeps the design system decoupled from any one icon library. */
  icon?: React.ReactNode;
  label: string;
  value: string;
}

export function StatTile({ icon, label, value }: StatTileProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return (
    <View
      style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
      accessible
      accessibilityLabel={`${value} ${label}`}
    >
      {icon}
      <Text style={[styles.value, { color: theme.ink }]}>{value}</Text>
      <Text style={[styles.label, { color: theme.inkMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 2,
  },
  value: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
  label: {
    fontSize: typography.fontSize.xs,
  },
});
