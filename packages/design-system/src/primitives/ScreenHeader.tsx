import React from 'react';
import { View, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors, spacing, radii } from '../tokens/index';
import { haptics } from '../utils/haptics';

type ScreenHeaderTone = 'light' | 'dark';

interface ScreenHeaderProps {
  /** Omit for an icon-only header (e.g. a full-bleed hero screen). */
  title?: string;
  onBack: () => void;
  /** 'dark' is for screens with a navy/photo background (camera capture, hero panels) — white icon on a translucent circle instead of ink-on-cream. */
  tone?: ScreenHeaderTone;
  /** Optional slot for a right-aligned action; otherwise the header stays back-button-balanced so the title centers correctly. */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The one back-navigation header every ride-creation/driver-onboarding
 * screen renders — consolidating what used to be four near-identical
 * inline copies (vehicle.tsx, selfie.tsx, publish.tsx, CaptureCamera.tsx)
 * so a back control can never go missing from a screen in this flow again.
 */
export function ScreenHeader({
  title,
  onBack,
  tone = 'light',
  right,
  style,
}: ScreenHeaderProps): React.JSX.Element {
  const isDark = tone === 'dark';

  return (
    <View style={[styles.row, style]}>
      <TouchableOpacity
        onPress={() => {
          haptics.selection();
          onBack();
        }}
        hitSlop={12}
        style={[styles.backBtn, isDark && styles.backBtnDark]}
        accessibilityRole="button"
        accessibilityLabel="Retour"
      >
        <Ionicons name="chevron-back" size={22} color={isDark ? colors.white : colors.gray900} />
      </TouchableOpacity>

      {title ? (
        <Text
          variant="label"
          color={isDark ? colors.white : colors.gray800}
          align="center"
          numberOfLines={1}
          style={styles.title}
        >
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}

      <View style={styles.side}>{right}</View>
    </View>
  );
}

const SIDE_SIZE = 36;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backBtn: {
    width: SIDE_SIZE,
    height: SIDE_SIZE,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnDark: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  title: {
    flex: 1,
  },
  side: {
    minWidth: SIDE_SIZE,
    alignItems: 'flex-end',
  },
});
