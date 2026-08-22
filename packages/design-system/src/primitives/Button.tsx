import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { colors, spacing, radii, elevation } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Overrides the announced label — defaults to `label`. */
  accessibilityLabel?: string;
  /** Optional `useAppTheme()` override (Stitch migration) — `primary`
   *  renders solid-accent/onAccent, `secondary` a muted surface fill,
   *  outline/ghost use ink instead of the legacy static palette. Omit for
   *  prior behavior on unmigrated screens. */
  theme?: AppPalette;
}

const sizeStyles: Record<ButtonSize, ViewStyle> = {
  sm: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 32,
  },
  md: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  lg: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 52,
  },
};

const sizeTextStyles: Record<ButtonSize, TextStyle> = {
  sm: { fontSize: 14 },
  md: { fontSize: 16 },
  lg: { fontSize: 18 },
};

function getVariantStyles(
  variant: ButtonVariant,
  disabled: boolean,
): { container: ViewStyle; text: TextStyle } {
  const opacity = disabled ? 0.5 : 1;

  switch (variant) {
    case 'primary':
      return {
        container: { backgroundColor: colors.primary, opacity },
        text: { color: colors.white },
      };
    case 'secondary':
      return {
        container: { backgroundColor: colors.secondary, opacity },
        text: { color: colors.white },
      };
    case 'outline':
      return {
        container: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.primary,
          opacity,
        },
        text: { color: colors.primary },
      };
    case 'ghost':
      return {
        container: { backgroundColor: 'transparent', opacity },
        text: { color: colors.primary },
      };
  }
}

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: ButtonProps): React.JSX.Element {
  const variantStyle = getVariantStyles(variant, disabled);
  const pressedStyle: ViewStyle = { transform: [{ scale: 0.97 }], opacity: 0.92 };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variant === 'primary' || variant === 'secondary' ? elevation?.sm : null,
        variantStyle.container,
        pressed && pressedStyle,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.text.color} size="small" />
      ) : (
        <Text style={[styles.text, sizeTextStyles[size], variantStyle.text]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    flexDirection: 'row',
    shadowColor: colors.gray900,
  },
  text: {
    fontWeight: '600',
  },
});
