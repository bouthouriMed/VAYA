import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';

interface CardProps {
  children: React.ReactNode;
  padding?: keyof typeof spacing;
  style?: StyleProp<ViewStyle>;
}

/** The one content card: theme surface, hairline outline, radius `xl`. */
export function Card({ children, padding = 'lg', style }: CardProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.outlineVariant, padding: spacing[padding] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
  },
});
