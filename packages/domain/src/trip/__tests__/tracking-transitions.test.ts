import { describe, it, expect } from 'vitest';
import {
  computeAutoTripStatusTransition,
  PICKUP_ARRIVAL_RADIUS_M,
  DESTINATION_APPROACH_RADIUS_M,
} from '../tracking-transitions';

const PICKUP = { lat: 36.8065, lng: 10.1815 }; // Tunis
const DESTINATION = { lat: 35.8256, lng: 10.6369 }; // Sousse

describe('computeAutoTripStatusTransition', () => {
  it('advances driver_approaching -> pickup once within the arrival radius', () => {
    const nearPickup = { lat: PICKUP.lat + 0.0005, lng: PICKUP.lng }; // ~55m
    expect(
      computeAutoTripStatusTransition('driver_approaching', nearPickup, PICKUP, DESTINATION),
    ).toBe('pickup');
  });

  it('does not advance driver_approaching while still far from pickup', () => {
    const farFromPickup = { lat: PICKUP.lat + 0.05, lng: PICKUP.lng }; // ~5.5km
    expect(
      computeAutoTripStatusTransition('driver_approaching', farFromPickup, PICKUP, DESTINATION),
    ).toBeNull();
  });

  it('advances active -> arriving once within the destination approach radius', () => {
    const nearDestination = { lat: DESTINATION.lat + 0.002, lng: DESTINATION.lng }; // ~220m
    expect(
      computeAutoTripStatusTransition('active', nearDestination, PICKUP, DESTINATION),
    ).toBe('arriving');
  });

  it('does not advance active while still far from the destination', () => {
    const farFromDestination = { lat: DESTINATION.lat + 0.05, lng: DESTINATION.lng };
    expect(
      computeAutoTripStatusTransition('active', farFromDestination, PICKUP, DESTINATION),
    ).toBeNull();
  });

  it('never auto-transitions a status this function has no rule for (e.g. pickup, scheduled)', () => {
    expect(computeAutoTripStatusTransition('pickup', PICKUP, PICKUP, DESTINATION)).toBeNull();
    expect(computeAutoTripStatusTransition('scheduled', PICKUP, PICKUP, DESTINATION)).toBeNull();
  });

  it('exports sane, positive radii', () => {
    expect(PICKUP_ARRIVAL_RADIUS_M).toBeGreaterThan(0);
    expect(DESTINATION_APPROACH_RADIUS_M).toBeGreaterThan(PICKUP_ARRIVAL_RADIUS_M);
  });
});
