import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing, radii } from '../tokens/index';

interface CardProps {
  children: React.ReactNode;
  padding?: keyof typeof spacing;
  style?: ViewStyle;
}

export function Card({ children, padding = 'lg', style }: CardProps): React.JSX.Element {
  return <View style={[styles.card, { padding: spacing[padding] }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.gray200,
  },
});
