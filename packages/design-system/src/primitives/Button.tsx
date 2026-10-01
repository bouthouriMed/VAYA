import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { spacing, radii } from '../tokens/index';
import { haptics } from '../utils/haptics';
import type { AppPalette } from '../theme/palette';
import { useAppTheme } from '../theme/AppThemeProvider';
import { Icon, type IconName } from './Icon';

/**
 * - `primary`: the one solid call-to-action on a screen — always `ink`
 *   (near-black in light mode, cream in dark mode). The accent green is
 *   reserved for status and highlights, never for a CTA fill, so a screen
 *   never has to choose between two "primary" looks.
 * - `secondary`: a muted-surface fill for an important but non-final action.
 * - `outline`: a bordered neutral action (Cancel, Share, empty-state CTAs).
 * - `ghost`: a text-only action (Not now, Back).
 * - `destructive`: a soft error-tinted fill for irreversible actions (log
 *   out, cancel a booking) — deliberately muted, never a saturated red.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Leading icon (e.g. chatbubble-outline for "Message"). */
  icon?: IconName;
  /** Trailing icon (e.g. arrow-forward for a "continue" style CTA). Mirrors in RTL. */
  trailingIcon?: IconName;
  style?: StyleProp<ViewStyle>;
  /** Overrides the announced label — defaults to `label`. */
  accessibilityLabel?: string;
  testID?: string;
  /** Overrides the theme from context — only needed for a screen that pins
   *  one palette regardless of the device setting (e.g. the always-dark
   *  sign-in hero). */
  theme?: AppPalette;
}

const sizeStyles: Record<ButtonSize, ViewStyle> = {
  sm: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, minHeight: 36 },
  md: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 48 },
  lg: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl, minHeight: 54 },
};

const sizeTextStyles: Record<ButtonSize, TextStyle> = {
  sm: { fontSize: 14 },
  md: { fontSize: 16 },
  lg: { fontSize: 16 },
};

function getVariantStyles(variant: ButtonVariant, theme: AppPalette): { container: ViewStyle; text: string } {
  switch (variant) {
    case 'primary':
      return { container: { backgroundColor: theme.ink }, text: theme.onInk };
    case 'secondary':
      return { container: { backgroundColor: theme.surfaceMuted }, text: theme.ink };
    case 'outline':
      return {
        container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.outline },
        text: theme.ink,
      };
    case 'ghost':
      return { container: { backgroundColor: 'transparent' }, text: theme.ink };
    case 'destructive':
      return { container: { backgroundColor: theme.errorMuted }, text: theme.error };
  }
}

/** The one disabled look for every filled button: a muted surface with faint text. */
function getDisabledStyles(variant: ButtonVariant, theme: AppPalette): { container: ViewStyle; text: string } {
  if (variant === 'ghost') return { container: { backgroundColor: 'transparent' }, text: theme.inkFaint };
  if (variant === 'outline') {
    return { container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.outlineVariant }, text: theme.inkFaint };
  }
  return { container: { backgroundColor: theme.surfaceMuted }, text: theme.inkFaint };
}

export function Button({
  variant = 'primary',
  size = 'md',
  label,
  onPress,
  disabled = false,
  loading = false,
  icon,
  trailingIcon,
  style,
  accessibilityLabel,
  testID,
  theme: themeOverride,
}: ButtonProps): React.JSX.Element {
  const { colors: contextTheme } = useAppTheme();
  const theme = themeOverride ?? contextTheme;
  const v = disabled ? getDisabledStyles(variant, theme) : getVariantStyles(variant, theme);

  // A light tap on every press, by default, for every button in the app —
  // distinct in timing (and feel) from a screen's own haptics.success()/
  // .error() on the eventual result of what this press triggered, so the
  // two never read as a jarring double-buzz for the same moment.
  function handlePress(): void {
    haptics.selection();
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        v.container,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size="xs" color={v.text} /> : null}
          <Text style={[styles.text, sizeTextStyles[size], { color: v.text }]} numberOfLines={1}>
            {label}
          </Text>
          {trailingIcon ? <Icon name={trailingIcon} size="xs" color={v.text} directional /> : null}
        </View>
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
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  text: {
    fontWeight: '600',
  },
});
