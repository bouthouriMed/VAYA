import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Text, Icon, Avatar, PassengerStopPin, spacing, radii, staggerDelay, durations } from '@vaya/design-system';
import type { AppPalette } from '@vaya/design-system';
import type { ItineraryThread, ItineraryThreadNode } from './itineraryThread';

const MARKER_SIZE = 26;

/**
 * The driver ride-hub's threaded itinerary (2026-08-31 overlap-clarity
 * fix, docs/domain/ride-engine.md) — replaces the flat, one-row-per-point
 * `compactStop` list that used to render `passengerItineraryPoints` with a
 * real vertical thread: one connector per leg, colored and weighted by how
 * many seats are actually occupied on it (dashed/muted when empty, solid
 * accent with one passenger, solid and heavier with two or more), plus an
 * inline tag the exact moment a second passenger boards while the first is
 * still aboard. The underlying data (`buildItineraryThread`,
 * itineraryThread.ts) was already real and route-order-sorted before this
 * change — only the rendering was flat.
 */
export function PassengerItineraryThread({
  thread,
  seatsTotal,
  theme,
  originEyebrow,
  destinationEyebrow,
  pickupPrefix,
  dropoffPrefix,
  onboardRangeTemplate,
  occupancyTagTemplate,
  onPressPassenger,
}: {
  thread: ItineraryThread;
  seatsTotal: number;
  theme: AppPalette;
  /** Translated "Departure"/"Arrival" eyebrow labels for the two endpoint
   *  rows — this component has no i18n dependency of its own, same
   *  translation-agnostic convention as DriverListCard/RouteOptionCard. */
  originEyebrow: string;
  destinationEyebrow: string;
  pickupPrefix: string;
  dropoffPrefix: string;
  /** `(from, to) => string`, e.g. t('rideDetail.onboardRange', { from, to }). */
  onboardRangeTemplate: (from: string, to: string) => string;
  /** `(seats, total) => string`, e.g. t('rideDetail.occupancyTag', {...}). */
  occupancyTagTemplate: (seats: number, total: number) => string;
  onPressPassenger?: (args: { riderId: string; bookingId: string }) => void;
}): React.JSX.Element {
  return (
    <View accessibilityRole="list">
      {thread.nodes.map((node, index) => {
        const isLast = index === thread.nodes.length - 1;
        const segment = !isLast ? thread.segments[index] : undefined;
        return (
          // Rows reveal top-to-bottom on mount, the same "journey unfolds
          // in order" register the search-results list stagger uses —
          // fitting here since this thread literally IS the trip's order.
          <Reanimated.View key={node.key} entering={FadeInDown.delay(staggerDelay(index)).duration(durations.base)}>
            <ThreadRow
              node={node}
              connectorOnboardSeats={segment?.onboardSeats}
              isLast={isLast}
              seatsTotal={seatsTotal}
              theme={theme}
              originEyebrow={originEyebrow}
              destinationEyebrow={destinationEyebrow}
              pickupPrefix={pickupPrefix}
              dropoffPrefix={dropoffPrefix}
              onboardRangeTemplate={onboardRangeTemplate}
              occupancyTagTemplate={occupancyTagTemplate}
              onPressPassenger={onPressPassenger}
            />
          </Reanimated.View>
        );
      })}
    </View>
  );
}

function ThreadRow({
  node,
  connectorOnboardSeats,
  isLast,
  seatsTotal,
  theme,
  originEyebrow,
  destinationEyebrow,
  pickupPrefix,
  dropoffPrefix,
  onboardRangeTemplate,
  occupancyTagTemplate,
  onPressPassenger,
}: {
  node: ItineraryThreadNode;
  connectorOnboardSeats?: number;
  isLast: boolean;
  seatsTotal: number;
  theme: AppPalette;
  originEyebrow: string;
  destinationEyebrow: string;
  pickupPrefix: string;
  dropoffPrefix: string;
  onboardRangeTemplate: (from: string, to: string) => string;
  occupancyTagTemplate: (seats: number, total: number) => string;
  onPressPassenger?: (args: { riderId: string; bookingId: string }) => void;
}): React.JSX.Element {
  const connectorStyle = !isLast ? styles.connector : undefined;
  const seats = connectorOnboardSeats ?? 0;
  const connectorColor = seats === 0 ? theme.outline : seats === 1 ? theme.accent : theme.accentStrong;
  const connectorWidth = seats >= 2 ? 4 : seats === 1 ? 3 : 2;
  const rowLabel = accessibilityLabelFor(node, originEyebrow, destinationEyebrow, pickupPrefix, dropoffPrefix);

  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={rowLabel}>
      <View style={styles.railCol}>
        <Marker node={node} theme={theme} />
        {connectorStyle ? (
          <View
            style={[
              connectorStyle,
              seats === 0
                ? { borderLeftWidth: connectorWidth, borderLeftColor: connectorColor, borderStyle: 'dashed' }
                : { width: connectorWidth, backgroundColor: connectorColor, borderRadius: connectorWidth / 2 },
            ]}
          />
        ) : null}
      </View>

      <View style={styles.contentCol}>
        {node.kind === 'origin' || node.kind === 'destination' ? (
          <EndpointContent node={node} eyebrow={node.kind === 'origin' ? originEyebrow : destinationEyebrow} theme={theme} />
        ) : (
          <PassengerContent
            node={node}
            seatsTotal={seatsTotal}
            theme={theme}
            prefix={node.kind === 'pickup' ? pickupPrefix : dropoffPrefix}
            onboardRangeTemplate={onboardRangeTemplate}
            occupancyTagTemplate={occupancyTagTemplate}
            onPressPassenger={onPressPassenger}
          />
        )}
      </View>
    </View>
  );
}

function Marker({ node, theme }: { node: ItineraryThreadNode; theme: AppPalette }): React.JSX.Element {
  if (node.kind === 'pickup' || node.kind === 'dropoff') {
    return <PassengerStopPin theme={theme} kind={node.kind} />;
  }
  return (
    <View style={[styles.endpointMarker, { backgroundColor: theme.ink, borderColor: theme.surface }]}>
      <Icon name={node.kind === 'origin' ? 'car' : 'flag'} size="xs" color={theme.onInk} />
    </View>
  );
}

function EndpointContent({
  node,
  eyebrow,
  theme,
}: {
  node: ItineraryThreadNode;
  eyebrow: string;
  theme: AppPalette;
}): React.JSX.Element {
  return (
    <View style={styles.contentPad}>
      <View style={styles.headerRow}>
        <Text variant="bodySmall" color={theme.inkMuted}>
          {eyebrow}
        </Text>
        {node.timeLabel ? (
          <Text variant="bodySmall" color={theme.inkMuted}>
            {node.timeLabel}
          </Text>
        ) : null}
      </View>
      <Text variant="body" color={theme.ink} numberOfLines={1} style={styles.boldLine}>
        {node.placeLabel}
      </Text>
      {node.subLabel ? (
        <Text variant="caption" color={theme.inkFaint} numberOfLines={1}>
          {node.subLabel}
        </Text>
      ) : null}
    </View>
  );
}

function PassengerContent({
  node,
  seatsTotal,
  theme,
  prefix,
  onboardRangeTemplate,
  occupancyTagTemplate,
  onPressPassenger,
}: {
  node: ItineraryThreadNode;
  seatsTotal: number;
  theme: AppPalette;
  prefix: string;
  onboardRangeTemplate: (from: string, to: string) => string;
  occupancyTagTemplate: (seats: number, total: number) => string;
  onPressPassenger?: (args: { riderId: string; bookingId: string }) => void;
}): React.JSX.Element {
  const canOpenProfile = Boolean(node.riderId && node.bookingId && onPressPassenger);
  const avatar = <Avatar uri={node.avatarUrl ?? null} name={node.passengerName ?? ''} sizePx={28} />;

  return (
    // A real bordered card, not a bare row — the endpoint rows above/below
    // stay plain, so a passenger stop reads as its own distinct grouped
    // unit against the thread line instead of blurring into a continuous
    // flat list. Matches the Stitch-reviewed reference's own treatment of
    // pickup/dropoff rows specifically.
    <View style={[styles.passengerCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}>
      <View style={styles.passengerHeaderRow}>
        {canOpenProfile ? (
          <TouchableOpacity
            onPress={() => onPressPassenger!({ riderId: node.riderId!, bookingId: node.bookingId! })}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={node.passengerName}
          >
            {avatar}
          </TouchableOpacity>
        ) : (
          avatar
        )}
        <Text variant="bodySmall" color={theme.ink} numberOfLines={1} style={styles.passengerName}>
          {node.passengerName}
        </Text>
        {node.timeLabel ? (
          <Text variant="bodySmall" color={theme.inkMuted}>
            {node.timeLabel}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color={theme.inkFaint} numberOfLines={1} style={styles.placeCaptionInCard}>
        {prefix} · {node.placeLabel}
      </Text>
      {node.onboardRange ? (
        <Text variant="caption" color={theme.inkFaint} style={styles.placeCaptionInCard}>
          {onboardRangeTemplate(node.onboardRange.from, node.onboardRange.to)}
        </Text>
      ) : null}
      {node.overlapping ? (
        <View style={[styles.occupancyTag, { backgroundColor: theme.warningMuted }]}>
          <View style={[styles.occupancyDot, { backgroundColor: theme.warning }]} />
          <Text variant="caption" color={theme.warning} style={styles.occupancyTagText}>
            {occupancyTagTemplate(node.occupiedSeatsAfter, seatsTotal)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function accessibilityLabelFor(
  node: ItineraryThreadNode,
  originEyebrow: string,
  destinationEyebrow: string,
  pickupPrefix: string,
  dropoffPrefix: string,
): string {
  if (node.kind === 'origin') return `${originEyebrow}, ${node.timeLabel ?? ''}, ${node.placeLabel}`;
  if (node.kind === 'destination') return `${destinationEyebrow}, ${node.timeLabel ?? ''}, ${node.placeLabel}`;
  const prefix = node.kind === 'pickup' ? pickupPrefix : dropoffPrefix;
  return `${prefix}, ${node.timeLabel ?? ''}, ${node.placeLabel}, ${node.passengerName ?? ''}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  railCol: {
    width: MARKER_SIZE,
    alignItems: 'center',
  },
  connector: {
    flex: 1,
    minHeight: spacing.lg,
    marginVertical: 2,
  },
  endpointMarker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentCol: {
    flex: 1,
  },
  contentPad: {
    paddingBottom: spacing.md,
    gap: 2,
  },
  passengerCard: {
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.sm,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  boldLine: {
    fontWeight: '700',
  },
  passengerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  passengerName: {
    flex: 1,
    fontWeight: '600',
  },
  placeCaption: {
    marginLeft: 28 + spacing.sm,
  },
  // Passenger content now renders inside its own bordered card
  // (`passengerCard`) — no manual left-offset needed to align with the
  // avatar the way the old bare, unbordered row required.
  placeCaptionInCard: {
    marginLeft: 0,
  },
  occupancyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  occupancyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  occupancyTagText: {
    fontWeight: '600',
  },
});
