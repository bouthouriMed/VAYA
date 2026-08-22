import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from './Text';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { spacing, radii } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

export interface DriverListCardPassenger {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface DriverListCardData {
  driverName: string;
  ratingAvg: number;
  timeLabel: string;
  priceLabel: string;
  pickupCityLabel: string;
  pickupPlaceLabel: string;
  pickupWalkLabel?: string;
  dropoffCityLabel: string;
  /** Omitted (not fabricated) when no specific stop is known beyond the
   *  searched destination itself. */
  dropoffPlaceLabel?: string;
  dropoffWalkLabel?: string;
  seatsAvailable: number;
  /** Real minute offset vs. the rider's requested time — omitted (not
   *  fabricated) when there's no meaningful difference. */
  timeOffsetNote?: string;
  /** Real already-accepted fellow passengers on this ride (public,
   *  first-name-only) — omitted/empty renders the seat-count text instead. */
  passengers?: DriverListCardPassenger[];
}

interface DriverListCardProps {
  data: DriverListCardData;
  /** Highlights this card as the algorithm's top pick — mirrors the
   *  existing `recommended`/`emphasized` concept already used by
   *  ClusterMarker/DriverMapPin, not a new ranking signal. */
  bestMatch?: boolean;
  onPress?: () => void;
  /** Theme colors from `useAppTheme()` — this primitive has no palette
   *  opinion of its own, it just renders whichever the caller passes. */
  theme: AppPalette;
}

function RouteRow({
  theme,
  dotColor,
  city,
  place,
  walkLabel,
  isLast,
}: {
  theme: AppPalette;
  dotColor: string;
  city: string;
  place?: string;
  walkLabel?: string;
  isLast: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.routeRow}>
      <View style={styles.routeDotsCol}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        {!isLast ? <View style={[styles.routeLine, { backgroundColor: theme.outlineVariant }]} /> : null}
      </View>
      <View style={styles.routeTextCol}>
        <View style={styles.routeCityRow}>
          <Text variant="body" color={theme.ink} numberOfLines={1} style={styles.routeCity}>
            {city}
          </Text>
          {walkLabel ? (
            <View style={[styles.walkChip, { backgroundColor: theme.accentGlow + '40' }]}>
              <Text variant="caption" color={theme.accentStrong}>
                {walkLabel}
              </Text>
            </View>
          ) : null}
        </View>
        {place ? (
          <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
            {place}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A single ride-match row for the search Results list. Built from existing
 * `Avatar`/`Icon`/`Text` — no bespoke local styling.
 */
export function DriverListCard({ data, bestMatch, onPress, theme }: DriverListCardProps): React.JSX.Element {
  return (
    <View>
      {bestMatch ? (
        <View style={styles.bestMatchRow}>
          <Icon name="star" size="xs" color={theme.info} />
          <Text variant="caption" color={theme.info} style={styles.bestMatchLabel}>
            MEILLEURE CORRESPONDANCE
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${data.driverName}, départ ${data.timeLabel}, ${data.priceLabel}`}
      >
        <View style={styles.body}>
          <View style={styles.headerRow}>
            <Text variant={bestMatch ? 'h2' : 'h3'} color={theme.ink}>
              {data.timeLabel}
            </Text>
            <Text variant={bestMatch ? 'h3' : 'body'} color={theme.accent}>
              {data.priceLabel}
            </Text>
          </View>

          {data.timeOffsetNote ? (
            <View style={[styles.noteBox, { backgroundColor: theme.background }]}>
              <Text variant="caption" color={theme.inkMuted}>
                {data.timeOffsetNote}
              </Text>
            </View>
          ) : null}

          <View style={styles.routeBlock}>
            <RouteRow
              theme={theme}
              dotColor={theme.ink}
              city={data.pickupCityLabel}
              place={data.pickupPlaceLabel}
              walkLabel={data.pickupWalkLabel}
              isLast={false}
            />
            <RouteRow
              theme={theme}
              dotColor={theme.accent}
              city={data.dropoffCityLabel}
              place={data.dropoffPlaceLabel}
              walkLabel={data.dropoffWalkLabel}
              isLast
            />
          </View>

          <View style={[styles.divider, { backgroundColor: theme.outlineVariant }]} />

          <View style={styles.footerRow}>
            <View style={styles.driverRow}>
              <Avatar name={data.driverName} size="sm" />
              <View>
                <Text variant="bodySmall" color={theme.ink} style={styles.driverName}>
                  {data.driverName}
                </Text>
                <View style={styles.ratingRow}>
                  <Icon name="star" size="xs" color={theme.accent} />
                  <Text variant="caption" color={theme.inkMuted}>
                    {data.ratingAvg.toFixed(1)}
                  </Text>
                </View>
              </View>
            </View>
            {data.passengers && data.passengers.length > 0 ? (
              <View style={styles.passengerStack}>
                {data.passengers.slice(0, 3).map((passenger, i) => (
                  <Avatar
                    key={passenger.userId}
                    uri={passenger.avatarUrl}
                    name={passenger.name}
                    sizePx={24}
                    style={[
                      styles.passengerAvatar,
                      { borderColor: theme.surface, marginLeft: i === 0 ? 0 : -8 },
                    ]}
                  />
                ))}
              </View>
            ) : (
              <Text variant="caption" color={theme.inkFaint}>
                {data.seatsAvailable} place{data.seatsAvailable > 1 ? 's' : ''}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bestMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  bestMatchLabel: {
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  body: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  noteBox: {
    borderRadius: radii.sm,
    padding: spacing.sm,
  },
  routeBlock: {
    gap: 0,
  },
  routeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  routeDotsCol: {
    width: 10,
    alignItems: 'center',
    paddingTop: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeLine: {
    flex: 1,
    minHeight: 20,
    width: 2,
    marginVertical: 4,
  },
  routeTextCol: {
    flex: 1,
    paddingBottom: spacing.sm,
  },
  routeCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  routeCity: {
    flexShrink: 1,
    fontWeight: '600',
  },
  walkChip: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  divider: {
    height: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  driverName: {
    fontWeight: '600',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  passengerStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passengerAvatar: {
    borderWidth: 2,
  },
});
