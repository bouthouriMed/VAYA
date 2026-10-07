import React, { useState } from 'react';
import { TextInput, View, Text as RNText, StyleSheet, type TextInputProps } from 'react-native';
import { spacing, radii, typography } from '../tokens/index';
import type { AppPalette } from '../theme/palette';
import { useAppTheme } from '../theme/AppThemeProvider';

/** Tunisia only, for now — the API validates `+216` + 8 digits. */
export const PHONE_COUNTRY_CODE = '+216';

/** Digits the user typed → the full E.164 number, or null when it isn't a
 *  complete 8-digit Tunisian number yet. Spaces/dashes are ignored, and a
 *  pasted number that already starts with 216/+216 is accepted. */
export function toTunisianE164(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('216')) digits = digits.slice(3);
  return digits.length === 8 ? `${PHONE_COUNTRY_CODE}${digits}` : null;
}

interface PhoneInputProps extends Omit<
  TextInputProps,
  'style' | 'keyboardType' | 'value' | 'onChangeText'
> {
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  /** Overrides the theme from context — only for a screen pinned to one palette. */
  theme?: AppPalette;
}

/**
 * Phone field with the fixed `+216` country pill in front — the one place
 * this pattern lives instead of each screen hand-rolling it. The value is
 * the local part only; use `toTunisianE164` to get the number to send.
 */
export function PhoneInput({
  value,
  onChangeText,
  error,
  theme: themeOverride,
  onFocus,
  onBlur,
  ...props
}: PhoneInputProps): React.JSX.Element {
  const { colors: contextTheme } = useAppTheme();
  const theme = themeOverride ?? contextTheme;
  const [isFocused, setIsFocused] = useState(false);
  const borderColor = error ? theme.error : isFocused ? theme.ink : theme.outline;

  return (
    <View style={styles.container}>
      <View style={[styles.row, { backgroundColor: theme.surface, borderColor }]}>
        <View style={[styles.countryPill, { backgroundColor: theme.surfaceMuted }]}>
          <RNText style={[styles.countryText, { color: theme.ink }]}>{PHONE_COUNTRY_CODE}</RNText>
        </View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={14}
          placeholderTextColor={theme.inkFaint}
          style={[styles.input, { color: theme.ink }]}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...props}
          accessibilityHint={props.accessibilityHint ?? error}
        />
      </View>
      {error ? <RNText style={[styles.error, { color: theme.error }]}>{error}</RNText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    minHeight: 52,
    gap: spacing.sm,
  },
  countryPill: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  countryText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.md,
    paddingVertical: spacing.sm,
  },
  error: {
    fontSize: typography.fontSize.xs,
  },
});
