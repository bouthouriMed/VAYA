import React, { useState } from 'react';
import { TextInput, View, Text as RNText, StyleSheet, type TextInputProps } from 'react-native';
import { colors, spacing, radii, typography } from '../tokens/index.js';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({
  label,
  error,
  helperText,
  onFocus,
  onBlur,
  ...props
}: InputProps): React.JSX.Element {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.container}>
      {label && <RNText style={styles.label}>{label}</RNText>}
      <TextInput
        style={[styles.input, isFocused && styles.inputFocused, error ? styles.inputError : null]}
        placeholderTextColor={colors.gray400}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
      {error && <RNText style={styles.error}>{error}</RNText>}
      {helperText && !error && <RNText style={styles.helper}>{helperText}</RNText>}
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
