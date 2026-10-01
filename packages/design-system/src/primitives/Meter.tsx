import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { spacing, radii, typography } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';

interface MeterProps {
  label: string;
  valueRatio: number;
  lowLabel?: string;
  highLabel?: string;
}

/** Reliability/punctuality segmented bar, labeled Low..High. */
export function Meter({
  label,
  valueRatio,
  lowLabel = 'Faible',
  highLabel = 'Élevée',
}: MeterProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const pct = Math.round(Math.max(0, Math.min(1, valueRatio)) * 100);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.ink }]}>{label}</Text>
      <View
        style={[styles.track, { backgroundColor: theme.outlineVariant }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.accent }]} />
      </View>
      <View style={styles.captionRow}>
        <Text style={[styles.caption, { color: theme.inkFaint }]}>{lowLabel}</Text>
        <Text style={[styles.caption, { color: theme.inkFaint }]}>{highLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    marginBottom: spacing.xs,
  },
  track: {
    height: 8,
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.full,
  },
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  caption: {
    fontSize: typography.fontSize.xs,
  },
});
