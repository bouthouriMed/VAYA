import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import type { AppPalette } from '../theme/palette';

/**
 * The pickup/dropoff marker pair used everywhere a ride's precise meeting
 * points render on a map — Publish's own map, the driver's ride-hub
 * preview, the passenger's ride-details screen. One shared, deliberately
 * small pair rather than each screen inventing its own dot: a teardrop
 * (the same shape/rotation trick MapSelectionMode's CenterPin already
 * uses for pin-drop selection — one consistent "this is a precise point"
 * language across the whole picking-and-viewing flow), accent-colored for
 * pickup and ink-colored for dropoff, matching explore.tsx's existing
 * accent-origin/ink-destination convention.
 *
 * StopPin is the third member of the same family: the numbered circle for
 * ranked candidate stops (Publish's recommended points, the passenger's
 * pickup/dropoff stop selection). Solid ink when selected, surface with an
 * outline border otherwise; renders a flag glyph instead of a number when
 * `flag` is set (the ride's anchor endpoint). The wrapping react-native-maps
 * Marker owns the accessibility label — the pin itself is a visual glyph,
 * exactly like PickupPin/DropoffPin.
 *
 * PassengerStopPin's pickup/dropoff coloring (revised for the driver
 * ride-hub's threaded itinerary, docs/domain/ride-engine.md): a driver
 * scanning a map with several passengers' points needs to tell "still to
 * pick up" from "already dropped off" at a glance, the same distinction
 * PickupPin/DropoffPin already make for the ride's own endpoints — a single
 * accentStrong color for both (the original rationale, kept below for
 * history) traded that real signal away for a "one category" purity that
 * doesn't hold up once two overlapping passengers are on screen together.
 */

const SIZE = 26;

export function PickupPin({ theme }: { theme: AppPalette }): React.JSX.Element {
  return (
    <View style={[styles.body, { backgroundColor: theme.accent, borderColor: theme.surface }]}>
      <View style={[styles.dot, { backgroundColor: theme.onAccent }]} />
    </View>
  );
}

export function DropoffPin({ theme }: { theme: AppPalette }): React.JSX.Element {
  return (
    <View style={[styles.body, { backgroundColor: theme.ink, borderColor: theme.surface }]}>
      <View style={[styles.dot, { backgroundColor: theme.onInk }]} />
    </View>
  );
}

export function StopPin({
  theme,
  index,
  selected = false,
  flag = false,
}: {
  theme: AppPalette;
  index: number;
  selected?: boolean;
  flag?: boolean;
}): React.JSX.Element {
  const fg = selected ? theme.onInk : theme.ink;
  return (
    <View
      style={[
        styles.stopBody,
        { borderColor: theme.outline, backgroundColor: theme.surface },
        selected && { backgroundColor: theme.ink, borderColor: theme.ink },
      ]}
    >
      {flag ? (
        <Icon name="flag" size="xs" color={fg} />
      ) : (
        <Text variant="caption" color={fg} style={styles.stopLabel}>
          {index}
        </Text>
      )}
    </View>
  );
}

const PASSENGER_STOP_SIZE = 18;

/**
 * A specific accepted passenger's own boarding/alighting point — distinct
 * from PickupPin/DropoffPin (the driver's own primary meeting points) and
 * StopPin (a candidate stop the driver hasn't committed to yet). Smaller,
 * a plain filled circle rather than a teardrop. `kind` now changes both the
 * icon (a "+" for pickup, a "−" for dropoff — legible at map-pin size,
 * where a walking-figure vs. checkmark glyph read as near-identical dots)
 * and the fill color (accent/green vs. error/coral), so a driver with
 * several passengers' points on screen can tell who's still to be picked up
 * from who's already been dropped off without opening the itinerary list.
 */
export function PassengerStopPin({
  theme,
  kind,
}: {
  theme: AppPalette;
  kind: 'pickup' | 'dropoff';
}): React.JSX.Element {
  const isPickup = kind === 'pickup';
  return (
    <View
      style={[
        styles.passengerStopBody,
        {
          backgroundColor: isPickup ? theme.accent : theme.error,
          borderColor: theme.surface,
        },
      ]}
    >
      <Icon name={isPickup ? 'add' : 'remove'} size="xs" color={isPickup ? theme.onAccent : theme.onError} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderBottomLeftRadius: 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-45deg' }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    transform: [{ rotate: '45deg' }],
  },
  stopBody: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  stopLabel: {
    fontWeight: '700',
  },
  passengerStopBody: {
    width: PASSENGER_STOP_SIZE,
    height: PASSENGER_STOP_SIZE,
    borderRadius: PASSENGER_STOP_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});
