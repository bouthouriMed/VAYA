import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, spacing, radii } from '../tokens/index';

interface StepProgressProps {
  /** 1-indexed. */
  currentStep: number;
  totalSteps: number;
  style?: StyleProp<ViewStyle>;
}

/** Discrete segmented stepper — filled up to (and including) currentStep. */
export function StepProgress({
  currentStep,
  totalSteps,
  style,
}: StepProgressProps): React.JSX.Element {
  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <View key={i} style={[styles.segment, i < currentStep && styles.segmentFilled]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.gray200,
  },
  segmentFilled: {
    backgroundColor: colors.secondary,
  },
});
