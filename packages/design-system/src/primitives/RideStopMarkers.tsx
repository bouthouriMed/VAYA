import React from 'react';
import { View, StyleSheet } from 'react-native';
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
});
