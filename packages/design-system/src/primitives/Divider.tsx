import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { spacing } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';

interface DividerProps {
  /** Defaults to the theme's `outlineVariant`. */
  color?: string;
  thickness?: number;
  marginVertical?: keyof typeof spacing;
  style?: ViewStyle;
}

export function Divider({
  color,
  thickness = 1,
  marginVertical = 'md',
  style,
}: DividerProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.divider,
        {
          backgroundColor: color ?? theme.outlineVariant,
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
