import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radii, typography } from '../tokens/index';

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
  const pct = Math.round(Math.max(0, Math.min(1, valueRatio)) * 100);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
      >
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.captionRow}>
        <Text style={styles.caption}>{lowLabel}</Text>
        <Text style={styles.caption}>{highLabel}</Text>
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
    color: colors.gray800,
    marginBottom: spacing.xs,
  },
  track: {
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.trustBarTrack,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.full,
    backgroundColor: colors.trustBarFill,
  },
  captionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  caption: {
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
  },
});
