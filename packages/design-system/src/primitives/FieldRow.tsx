import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { colors, spacing, radii, typography, elevation } from '../tokens/index';

interface FieldRowProps {
  label: string;
  value: string;
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
  return <View style={[styles.card, elevation?.sm, style]}>{children}</View>;
}

export function FieldRow({
  label,
  value,
  dotColor = colors.secondary,
  dotFilled = true,
  last = false,
  placeholder = false,
  onPress,
}: FieldRowProps): React.JSX.Element {
  const content = (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View
        style={[
          styles.dot,
          dotFilled
            ? { backgroundColor: dotColor }
            : { backgroundColor: 'transparent', borderWidth: 2, borderColor: dotColor },
        ]}
      />
      <View style={styles.textCol}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, placeholder && styles.valuePlaceholder]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity
      onPress={onPress}
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
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.md,
    shadowColor: colors.gray900,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
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
    color: colors.gray600,
    marginBottom: 1,
  },
  value: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray900,
  },
  valuePlaceholder: {
    color: colors.gray500,
    fontWeight: typography.fontWeight.regular,
  },
});
