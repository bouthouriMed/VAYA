import React, { useState } from 'react';
import { TextInput, View, Text as RNText, StyleSheet, type TextInputProps } from 'react-native';
import { colors, spacing, radii, typography } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Optional `useAppTheme()` override (Stitch migration) — when given, the
   *  field follows the live theme (a bordered, faintly-tinted recessed
   *  field, matching GlassSurface/BottomSheet/Chip's own treatment) instead
   *  of the legacy static `colors` tokens, which render as a flat white box
   *  regardless of the surrounding screen's theme. Unused (and defaulting
   *  to the legacy look) anywhere this primitive hasn't been migrated yet. */
  theme?: AppPalette;
}

export function Input({
  label,
  error,
  helperText,
  onFocus,
  onBlur,
  theme,
  ...props
}: InputProps): React.JSX.Element {
  const [isFocused, setIsFocused] = useState(false);

  const labelColor = theme ? theme.inkMuted : colors.gray700;
  const placeholderColor = theme ? theme.inkFaint : colors.gray400;
  const helperColor = theme ? theme.inkFaint : colors.gray500;
  const errorColor = theme ? theme.error : colors.error;

  const inputThemedStyle = theme
    ? {
        backgroundColor: theme.surfaceMuted,
        borderColor: isFocused ? theme.ink : theme.outlineVariant,
        color: theme.ink,
      }
    : null;

  return (
    <View style={styles.container}>
      {label && <RNText style={[styles.label, { color: labelColor }]}>{label}</RNText>}
      <TextInput
        style={[
          styles.input,
          inputThemedStyle,
          !theme && isFocused && styles.inputFocused,
          !theme && error ? styles.inputError : null,
          theme && error ? { borderColor: errorColor } : null,
        ]}
        placeholderTextColor={placeholderColor}
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
      {error && <RNText style={[styles.error, { color: errorColor }]}>{error}</RNText>}
      {helperText && !error && (
        <RNText style={[styles.helper, { color: helperColor }]}>{helperText}</RNText>
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
