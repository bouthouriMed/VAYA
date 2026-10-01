import React from 'react';
import { I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
type IconSize = 'xs' | 'sm' | 'md' | 'lg';

interface IconProps {
  name: IconName;
  size?: IconSize;
  /** Defaults to the active theme's ink. */
  color?: string;
  /** Set when the icon conveys meaning on its own (not decorating adjacent
   *  labeled text) — e.g. a standalone icon-only button. Leave unset for
   *  purely decorative icons next to a text label, so screen readers don't
   *  announce it twice. */
  accessibilityLabel?: string;
  /** Mirror horizontally in RTL — for directional glyphs (chevrons, arrows)
   *  that point "forward"/"back" rather than at a fixed compass direction. */
  directional?: boolean;
}

// Curated subset of the spacing scale — icons at arbitrary pixel sizes
// fragment the visual rhythm the rest of the system maintains.
export const ICON_SIZES: Record<IconSize, number> = {
  xs: spacing.lg, // 16
  sm: spacing.xl, // 20
  md: spacing['2xl'], // 24
  lg: spacing['3xl'], // 32
};

/**
 * Thin wrapper over Ionicons so size/color stay on-token instead of screens
 * importing Ionicons directly and picking arbitrary pixel values.
 */
export function Icon({
  name,
  size = 'md',
  color,
  accessibilityLabel,
  directional = false,
}: IconProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  return (
    <Ionicons
      name={name}
      size={ICON_SIZES[size]}
      color={color ?? theme.ink}
      style={directional && I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
