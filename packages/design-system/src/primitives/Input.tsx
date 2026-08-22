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
import { colors, spacing, radii, typography } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Optional extra styling applied directly to the TextInput (e.g. the
   *  chat composer's full-pill radius) — composes after theme/base styles. */
  style?: StyleProp<TextStyle>;
  /** Optional `useAppTheme()` override (Stitch migration) — field renders
   *  ink-on-surface with an outlineVariant border and accent focus ring
   *  instead of the legacy static palette. Omit for prior behavior. */
  theme?: AppPalette;
}

export function Input({
  label,
  error,
  helperText,
  style,
  theme,
  onFocus,
  onBlur,
  ...props
}: InputProps): React.JSX.Element {
  const [isFocused, setIsFocused] = useState(false);

  const themedField = theme
    ? {
        borderColor: isFocused ? theme.accent : error ? theme.error : theme.outlineVariant,
        color: theme.ink,
        backgroundColor: theme.surfaceMuted,
      }
    : {
        borderColor: error ? colors.error : isFocused ? colors.primary : colors.gray300,
        // Legacy static palette keeps its stylesheet values.
      };

  return (
    <View style={styles.container}>
      {label && (
        <RNText style={[styles.label, theme ? { color: theme.inkMuted } : null]}>{label}</RNText>
      )}
      <TextInput
        style={[
          styles.input,
          !theme && isFocused && styles.inputFocused,
          !theme && error ? styles.inputError : null,
          theme ? themedField : null,
          style,
        ]}
        placeholderTextColor={theme ? theme.inkFaint : colors.gray400}
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
      {error && (
        <RNText style={[styles.error, theme ? { color: theme.error } : null]}>{error}</RNText>
      )}
      {helperText && !error && (
        <RNText style={[styles.helper, theme ? { color: theme.inkFaint } : null]}>{helperText}</RNText>
      )}
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
    color: colors.gray700,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.gray300,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSize.md,
    color: colors.gray900,
    minHeight: 44,
    backgroundColor: colors.white,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  inputError: {
    borderColor: colors.error,
  },
  error: {
    fontSize: typography.fontSize.xs,
    color: colors.error,
  },
  helper: {
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
  },
});
