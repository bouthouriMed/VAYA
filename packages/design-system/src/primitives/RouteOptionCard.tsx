import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { spacing, radii } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

export type RouteOptionKind = 'fastest' | 'no_tolls' | 'no_highways' | 'alternative';

export interface RouteOptionCardData {
  kind: RouteOptionKind;
  label: string;
  distanceM: number;
  durationSec: number;
  isEstimate: boolean;
  hasTolls: boolean | null;
  recommended: boolean;
}

interface RouteOptionCardProps {
  option: RouteOptionCardData;
  selected: boolean;
  onPress: () => void;
  theme: AppPalette;
  tollsLabel?: string;
  noTollsLabel?: string;
  estimateLabel?: string;
  recommendedLabel?: string;
}

const KIND_ICON: Record<RouteOptionKind, IconName> = {
  fastest: 'flash-outline',
  no_tolls: 'cash-outline',
  no_highways: 'trail-sign-outline',
  alternative: 'shuffle-outline',
};

function formatDistanceKm(distanceM: number): string {
  const km = distanceM / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

function formatDuration(durationSec: number): string {
  const totalMin = Math.round(durationSec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min === 0 ? `${hours} h` : `${hours} h ${min.toString().padStart(2, '0')}`;
}

/**
 * One selectable card in the route-selection step's bottom sheet — mirrors
 * `Chip`'s selected/unselected theming idiom (solid accent fill when
 * selected, quiet outlined surface otherwise) at card scale rather than
 * pill scale. Purely presentational: distance/duration/toll info always
 * comes straight from a real routing-provider response
 * (`route-options.service.ts`), never fabricated — an unknown toll status
 * (`hasTolls: null`) simply omits the toll caption instead of guessing.
 */
export function RouteOptionCard({
  option,
  selected,
  onPress,
  theme,
  tollsLabel = 'péages',
  noTollsLabel = 'sans péage',
  estimateLabel = 'estimation',
  recommendedLabel = 'Recommandé',
}: RouteOptionCardProps): React.JSX.Element {
  const iconWrapStyle = selected
    ? { backgroundColor: theme.onAccent + '33' }
    : { backgroundColor: theme.surfaceMuted };
  const iconColor = selected ? theme.onAccent : theme.inkMuted;
  const labelColor = selected ? theme.onAccent : theme.ink;
  const captionColor = selected ? theme.onAccent + 'CC' : theme.inkFaint;

  const captionParts = [formatDistanceKm(option.distanceM), formatDuration(option.durationSec)];
  if (option.hasTolls === true) captionParts.push(tollsLabel);
  if (option.hasTolls === false) captionParts.push(noTollsLabel);
  if (option.isEstimate) captionParts.push(estimateLabel);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.card,
        {
          backgroundColor: selected ? theme.accent : theme.surface,
          borderColor: selected ? 'transparent' : theme.outlineVariant,
        },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.label}, ${captionParts.join(', ')}`}
    >
      <View style={[styles.iconWrap, iconWrapStyle]}>
        <Icon name={KIND_ICON[option.kind]} size="sm" color={iconColor} />
      </View>
      <View style={styles.textCol}>
        <View style={styles.labelRow}>
          <Text variant="label" color={labelColor} numberOfLines={1}>
            {option.label}
          </Text>
          {option.recommended ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: selected ? theme.onAccent + '26' : theme.accent + '1F' },
              ]}
            >
              <Text
                variant="caption"
                color={selected ? theme.onAccent : theme.accent}
                style={styles.badgeText}
              >
                {recommendedLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="bodySmall" color={captionColor} numberOfLines={1}>
          {captionParts.join(' · ')}
        </Text>
      </View>
      <View
        style={[
          styles.radioOuter,
          { borderColor: selected ? theme.onAccent : theme.outlineVariant },
        ]}
      >
        {selected ? <View style={[styles.radioInner, { backgroundColor: theme.onAccent }]} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  badgeText: {
    fontSize: 10,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
