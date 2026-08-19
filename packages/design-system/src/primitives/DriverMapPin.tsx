import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, spacing, radii, typography } from '../tokens/index';
import { Avatar } from './Avatar';

export interface DriverMapPinData {
  id: string;
  name: string;
  avatarUri?: string | null;
  /** Pre-formatted for display, e.g. "5 DT" — currency/rounding is the caller's call. */
  priceLabel?: string;
  etaLabel?: string;
  statusLabel?: string;
}

export type DriverMapPinVariant = 'compact' | 'full';

interface DriverMapPinProps {
  data: DriverMapPinData;
  /** 'compact' = avatar-only dot, for dense/zoomed-out maps. 'full' = the labeled pill. */
  variant?: DriverMapPinVariant;
  /** Continuous size multiplier on top of variant, e.g. driven by a map's zoom level. */
  scale?: number;
  recommended?: boolean;
  /** Flips the pill so its label reads to the left of the avatar instead of the right —
   *  useful for alternating pins so labels don't collide with the route line. */
  labelSide?: 'start' | 'end';
  accentColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const BASE_AVATAR_PX = 36;
const BASE_COMPACT_PX = 22;

export function DriverMapPin({
  data,
  variant = 'full',
  scale = 1,
  recommended = false,
  labelSide = 'end',
  accentColor = colors.secondary,
  onPress,
  style,
}: DriverMapPinProps): React.JSX.Element {
  if (variant === 'compact') {
    const size = Math.round(BASE_COMPACT_PX * scale);
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.8}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={data.name}
        style={[
          styles.compactWrap,
          { width: size + 6, height: size + 6, borderRadius: (size + 6) / 2 },
          recommended && { borderColor: accentColor, borderWidth: 2 },
          style,
        ]}
      >
        <Avatar uri={data.avatarUri} name={data.name} sizePx={size} />
      </TouchableOpacity>
    );
  }

  const avatarPx = Math.round(BASE_AVATAR_PX * scale);
  const metaLine = [data.statusLabel, data.etaLabel].filter(Boolean).join(' · ');
  const fullLabel = [data.name, data.priceLabel, metaLine].filter(Boolean).join(', ');

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={fullLabel}
      style={[
        styles.pill,
        labelSide === 'start' && styles.pillReversed,
        recommended && { borderWidth: 1.5, borderColor: accentColor },
        style,
      ]}
    >
      <Avatar uri={data.avatarUri} name={data.name} sizePx={avatarPx} />
      <View>
        <Text style={[styles.name, { fontSize: 12 * scale }]} numberOfLines={1}>
          {data.name}
          {data.priceLabel ? ` · ${data.priceLabel}` : ''}
        </Text>
        {metaLine ? (
          <Text style={[styles.meta, { fontSize: 10 * scale }]} numberOfLines={1}>
            {metaLine}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  compactWrap: {
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radii.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    paddingRight: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  pillReversed: {
    flexDirection: 'row-reverse',
    paddingRight: spacing.sm,
    paddingLeft: spacing.md,
  },
  name: {
    fontWeight: typography.fontWeight.bold,
    color: colors.gray900,
  },
  meta: {
    color: colors.gray600,
  },
});
