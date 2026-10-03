import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text as RNText,
  StyleSheet,
  type TextInputProps,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { spacing, radii, typography } from '../tokens/index';
import type { AppPalette } from '../theme/palette';
import { useAppTheme } from '../theme/AppThemeProvider';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Overrides the theme from context — only for a screen pinned to one palette. */
  theme?: AppPalette;
  /** Style applied to the underlying TextInput (last, so callers win). */
  style?: StyleProp<TextStyle>;
}

/**
 * The one text field: a surface-colored field with a hairline outline that
 * turns `ink` on focus and `error` when invalid. The label sits above the
 * field; placeholders use `inkFaint` so they never read as a typed value.
 */
export function Input({
  label,
  error,
  helperText,
  style,
  theme: themeOverride,
  onFocus,
  onBlur,
  ...props
}: InputProps): React.JSX.Element {
  const { colors: contextTheme } = useAppTheme();
  const theme = themeOverride ?? contextTheme;
  const [isFocused, setIsFocused] = useState(false);

  const borderColor = error ? theme.error : isFocused ? theme.ink : theme.outline;

  return (
    <View style={styles.container}>
      {label ? <RNText style={[styles.label, { color: theme.inkMuted }]}>{label}</RNText> : null}
      <TextInput
        style={[styles.input, { backgroundColor: theme.surface, borderColor, color: theme.ink }, style]}
        placeholderTextColor={theme.inkFaint}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityHint={props.accessibilityHint ?? error ?? helperText}
      />
      {error ? <RNText style={[styles.helper, { color: theme.error }]}>{error}</RNText> : null}
      {helperText && !error ? <RNText style={[styles.helper, { color: theme.inkFaint }]}>{helperText}</RNText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    minHeight: 52,
  },
  helper: {
    fontSize: typography.fontSize.xs,
  },
});
