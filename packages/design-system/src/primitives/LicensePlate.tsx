import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import { lightPalette, type AppPalette } from '../theme/palette';

interface LicensePlateProps {
  plate: string;
  accessibilityLabel: string;
  theme?: AppPalette;
}

/** "123 TU 4567" / "123 تونس 4567" → its two numbers, or null when the plate
 *  isn't a standard Tunisian series plate (shown verbatim instead). */
export function parseTunisianPlate(plate: string): { serial: string; number: string } | null {
  const match = /^\s*(\d{1,3})\s*(?:TU|TN|تونس)\s*(\d{1,4})\s*$/i.exec(plate);
  return match ? { serial: match[1]!, number: match[2]! } : null;
}

/**
 * The plate as it looks on the car, so a passenger can spot it on the
 * street: dark plate, light characters, "تونس" between the two numbers on a
 * standard Tunisian plate. Always dark in both themes (a real plate doesn't
 * change with the phone's setting) — a hairline keeps it distinct from a
 * dark background.
 */
export function LicensePlate({ plate, accessibilityLabel, theme: themeOverride }: LicensePlateProps): React.JSX.Element {
  const { colors } = useAppTheme();
  const theme = themeOverride ?? colors;
  const parts = parseTunisianPlate(plate);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={[styles.plate, { backgroundColor: lightPalette.ink, borderColor: theme.outline }]}
    >
      {parts ? (
        <>
          <Text variant="label" color={lightPalette.onInk} style={styles.digits}>
            {parts.serial}
          </Text>
          <Text variant="caption" color={lightPalette.onInk} style={styles.country}>
            تونس
          </Text>
          <Text variant="label" color={lightPalette.onInk} style={styles.digits}>
            {parts.number}
          </Text>
        </>
      ) : (
        <Text variant="label" color={lightPalette.onInk} style={styles.digits}>
          {plate}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    // Plates read left-to-right in Tunisia even in an Arabic UI.
    direction: 'ltr',
  },
  digits: {
    letterSpacing: 1,
    fontWeight: '700',
  },
  country: {
    fontWeight: '600',
  },
});
