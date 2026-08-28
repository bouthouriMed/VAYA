import { describe, it, expect } from 'vitest';
import {
  computeMaxConcurrentSeats,
  wouldExceedCapacity,
  type BookingSegment,
} from '../segment-capacity';

const INF = Infinity;

describe('computeMaxConcurrentSeats', () => {
  it('is 0 for no segments', () => {
    expect(computeMaxConcurrentSeats([])).toBe(0);
  });

  it('is the segment size for a single booking', () => {
    const seg: BookingSegment = { seatsRequested: 2, pickupSequence: 0, dropoffSequence: 3 };
    expect(computeMaxConcurrentSeats([seg])).toBe(2);
  });

  it('does NOT count two bookings as overlapping when one ends exactly where the next begins', () => {
    // Tunis(0) -> Hammamet(1): 1 seat. Hammamet(1) -> Sousse(2): 1 seat.
    // The first passenger has already alighted at Hammamet by the time the
    // second boards — never simultaneously 2.
    const a: BookingSegment = { seatsRequested: 1, pickupSequence: 0, dropoffSequence: 1 };
    const b: BookingSegment = { seatsRequested: 1, pickupSequence: 1, dropoffSequence: 2 };
    expect(computeMaxConcurrentSeats([a, b])).toBe(1);
  });

  it('sums seats for genuinely overlapping segments', () => {
    // Tunis(0) -> Sousse(2): 2 seats, overlapping Hammamet(1) -> Monastir(3): 1 seat,
    // for the shared span [1,2).
    const a: BookingSegment = { seatsRequested: 2, pickupSequence: 0, dropoffSequence: 2 };
    const b: BookingSegment = { seatsRequested: 1, pickupSequence: 1, dropoffSequence: 3 };
    expect(computeMaxConcurrentSeats([a, b])).toBe(3);
  });

  it('treats a free-form/no-stop pickup as starting at the ride\'s true origin (-Infinity)', () => {
    const legacyEndpoint: BookingSegment = { seatsRequested: 1, pickupSequence: -INF, dropoffSequence: INF };
    const midRoute: BookingSegment = { seatsRequested: 1, pickupSequence: 0, dropoffSequence: 1 };
    expect(computeMaxConcurrentSeats([legacyEndpoint, midRoute])).toBe(2);
  });

  it('the flagship scenario: driver has 4 seats, Tunis->Hammamet passenger + a later Hammamet->Sousse passenger never overlap', () => {
    // Tunis(0) -> Hammamet(1) -> Sousse(2) -> Monastir(3).
    const tunisToHammamet: BookingSegment = { seatsRequested: 1, pickupSequence: 0, dropoffSequence: 1 };
    const hammametToSousse: BookingSegment = { seatsRequested: 1, pickupSequence: 1, dropoffSequence: 2 };
    expect(computeMaxConcurrentSeats([tunisToHammamet, hammametToSousse])).toBe(1);
    expect(computeMaxConcurrentSeats([tunisToHammamet, hammametToSousse])).toBeLessThanOrEqual(4);
  });

  it('is order-independent (segment array order never changes the result)', () => {
    const segs: BookingSegment[] = [
      { seatsRequested: 2, pickupSequence: 0, dropoffSequence: 3 },
      { seatsRequested: 1, pickupSequence: 1, dropoffSequence: 2 },
      { seatsRequested: 1, pickupSequence: 2, dropoffSequence: 4 },
    ];
    const forward = computeMaxConcurrentSeats(segs);
    const reversed = computeMaxConcurrentSeats([...segs].reverse());
    expect(forward).toBe(reversed);
  });
});

describe('wouldExceedCapacity', () => {
  it('rejects a candidate that would push a shared segment over seatsTotal', () => {
    const existing: BookingSegment[] = [{ seatsRequested: 2, pickupSequence: 0, dropoffSequence: 2 }];
    const candidate: BookingSegment = { seatsRequested: 1, pickupSequence: 1, dropoffSequence: 3 };
    // 2 (existing, spans [0,2)) + 1 (candidate, spans [1,3)) overlap on [1,2) = 3 total.
    expect(wouldExceedCapacity(existing, candidate, 2)).toBe(true);
    expect(wouldExceedCapacity(existing, candidate, 3)).toBe(false);
  });

  it('accepts a candidate on a genuinely non-overlapping later segment even when the ride-global seat count would otherwise look exhausted', () => {
    // 4-seat ride, already 4 seats occupied Tunis->Hammamet — but a request
    // for the Hammamet->Sousse leg occupies a disjoint span and must still
    // fit, which the old flat ride.seatsAvailable scalar could never
    // express (this is the exact case matching-engine architecture plan §K
    // exists to fix).
    const existing: BookingSegment[] = [{ seatsRequested: 4, pickupSequence: 0, dropoffSequence: 1 }];
    const candidate: BookingSegment = { seatsRequested: 4, pickupSequence: 1, dropoffSequence: 2 };
    expect(wouldExceedCapacity(existing, candidate, 4)).toBe(false);
  });

  it('rejects an endpoint (whole-ride) candidate that would exceed capacity against any existing booking', () => {
    const existing: BookingSegment[] = [{ seatsRequested: 3, pickupSequence: 0, dropoffSequence: 1 }];
    const candidate: BookingSegment = { seatsRequested: 2, pickupSequence: -INF, dropoffSequence: INF };
    expect(wouldExceedCapacity(existing, candidate, 4)).toBe(true);
  });

  it('accepts the very first booking on an empty ride whenever it fits within seatsTotal', () => {
    const candidate: BookingSegment = { seatsRequested: 4, pickupSequence: -INF, dropoffSequence: INF };
    expect(wouldExceedCapacity([], candidate, 4)).toBe(false);
    expect(wouldExceedCapacity([], { ...candidate, seatsRequested: 5 }, 4)).toBe(true);
  });
});
