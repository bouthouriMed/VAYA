import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, spacing, typography } from '../tokens/index';

interface ClusterMarkerProps {
  label: string;
  emphasized?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const HALO_SIZE = 64;
const RING_SIZE = 46;
const CORE_SIZE = 20;

/**
 * Concentric "radar ping" marker for the journey-clustering grid: a pale outer
 * halo, a mid-tone sage ring, and a dark navy core — with a time label below.
 */
export function ClusterMarker({
  label,
  emphasized = false,
  onPress,
  style,
}: ClusterMarkerProps): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.wrap, style]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.halo, emphasized && styles.haloEmphasized]}>
        <View style={[styles.ring, emphasized && styles.ringEmphasized]}>
          <View style={styles.core} />
        </View>
      </View>
      <Text style={[styles.label, emphasized && styles.labelEmphasized]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  halo: {
    width: HALO_SIZE,
    height: HALO_SIZE,
    borderRadius: HALO_SIZE / 2,
    backgroundColor: colors.secondaryLight + '3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloEmphasized: {
    backgroundColor: colors.secondaryLight + '55',
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: colors.secondary + 'B0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringEmphasized: {
    backgroundColor: colors.secondary,
  },
  core: {
    width: CORE_SIZE,
    height: CORE_SIZE,
    borderRadius: CORE_SIZE / 2,
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray800,
    textAlign: 'center',
  },
  labelEmphasized: {
    color: colors.gray900,
  },
});
