import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { spacing, radii, typography } from '../tokens/index';
import { haptics } from '../utils/haptics';
import { useAppTheme } from '../theme/AppThemeProvider';

interface FieldRowProps {
  label: string;
  value: string;
  /** Defaults to the theme accent. */
  dotColor?: string;
  dotFilled?: boolean;
  last?: boolean;
  placeholder?: boolean;
  onPress?: () => void;
}

interface FieldCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Groups FieldRow entries into the pill-card input pattern (dot + label/value stack). */
export function FieldCard({ children, style }: FieldCardProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }, style]}>
      {children}
    </View>
  );
}

export function FieldRow({
  label,
  value,
  dotColor,
  dotFilled = true,
  last = false,
  placeholder = false,
  onPress,
}: FieldRowProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const dot = dotColor ?? theme.accent;
  const content = (
    <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: theme.outlineVariant }]}>
      <View
        style={[
          styles.dot,
          dotFilled ? { backgroundColor: dot } : { backgroundColor: 'transparent', borderWidth: 2, borderColor: dot },
        ]}
      />
      <View style={styles.textCol}>
        <Text style={[styles.label, { color: theme.inkMuted }]}>{label}</Text>
        <Text
          style={[styles.value, { color: theme.ink }, placeholder && [styles.valuePlaceholder, { color: theme.inkFaint }]]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  textCol: {
    flex: 1,
  },
  label: {
    fontSize: typography.fontSize.xs,
    marginBottom: 1,
  },
  value: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  valuePlaceholder: {
    fontWeight: typography.fontWeight.regular,
  },
});
