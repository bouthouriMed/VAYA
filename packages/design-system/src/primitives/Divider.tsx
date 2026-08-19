import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing } from '../tokens/index';

interface DividerProps {
  color?: string;
  thickness?: number;
  marginVertical?: keyof typeof spacing;
  style?: ViewStyle;
}

export function Divider({
  color = colors.gray200,
  thickness = 1,
  marginVertical = 'md',
  style,
}: DividerProps): React.JSX.Element {
  return (
    <View
      style={[
        styles.divider,
        {
          backgroundColor: color,
          height: thickness,
          marginVertical: spacing[marginVertical],
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    width: '100%',
  },
});
