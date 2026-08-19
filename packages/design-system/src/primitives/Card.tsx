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
    borderRadius: radii['2xl'],
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
});
