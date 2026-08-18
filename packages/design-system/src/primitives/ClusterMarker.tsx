import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../tokens/index';

interface ClusterMarkerProps {
  label: string;
  emphasized?: boolean;
  onPress?: () => void;
}

/** Concentric-ring "radar" marker used in the journey-clustering grid, with a time label below. */
export function ClusterMarker({
  label,
  emphasized = false,
  onPress,
}: ClusterMarkerProps): React.JSX.Element {
  return (
    <TouchableOpacity style={styles.wrap} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <View style={[styles.ring, emphasized && styles.ringEmphasized]}>
        <View style={[styles.core, emphasized && styles.coreEmphasized]} />
      </View>
      <Text style={[styles.label, emphasized && styles.labelEmphasized]}>{label}</Text>
    </TouchableOpacity>
  );
}

const RING_SIZE = 52;
const CORE_SIZE = 20;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    width: 88,
    gap: spacing.xs,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: colors.secondaryLight + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringEmphasized: {
    backgroundColor: colors.secondaryLight + '88',
  },
  core: {
    width: CORE_SIZE,
    height: CORE_SIZE,
    borderRadius: CORE_SIZE / 2,
    backgroundColor: colors.secondary,
  },
  coreEmphasized: {
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray700,
    textAlign: 'center',
  },
  labelEmphasized: {
    color: colors.gray900,
    fontWeight: typography.fontWeight.semibold,
  },
});
