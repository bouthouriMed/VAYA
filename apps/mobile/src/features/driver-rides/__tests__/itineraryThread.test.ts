import { describe, expect, it } from 'vitest';
import { buildItineraryThread, type ItineraryStopEvent } from '../itineraryThread';

const ORIGIN = { lat: 40.8, lng: 0.5, label: 'Benifallet, Tarragona', timeLabel: '12:45' };
const DESTINATION = { lat: 42.05, lng: 3.2, label: "L'Estartit, Girona", timeLabel: '16:21' };

function event(overrides: Partial<ItineraryStopEvent>): ItineraryStopEvent {
  return {
    bookingId: 'b-1',
    kind: 'pickup',
    lat: 41,
    lng: 1,
    label: 'Tarragona',
    passengerName: 'Dinara Kochakajeva',
    avatarUrl: null,
    riderId: 'u-1',
    seatsRequested: 1,
    fraction: 0.3,
    timeLabel: '14:03',
    ...overrides,
  };
}

describe('buildItineraryThread', () => {
  it('a single passenger produces origin, pickup, dropoff, destination with no overlap', () => {
    const dinaraPickup = event({ fraction: 0.3, timeLabel: '14:03' });
    const dinaraDropoff = event({
      kind: 'dropoff',
      bookingId: 'b-1',
      fraction: 0.8,
      timeLabel: '16:14',
      label: 'Pals, Girona',
    });

    const { nodes, segments } = buildItineraryThread(ORIGIN, DESTINATION, [dinaraPickup, dinaraDropoff]);

    expect(nodes.map((n) => n.kind)).toEqual(['origin', 'pickup', 'dropoff', 'destination']);
    expect(nodes.every((n) => !n.overlapping)).toBe(true);
    // Onboard only between the pickup and dropoff legs.
    expect(segments.map((s) => s.onboardSeats)).toEqual([0, 1, 0]);
    // Full onboard range attached to the pickup node.
    expect(nodes[1]!.onboardRange).toEqual({ from: '14:03', to: '16:14' });
  });

  it('flags the overlap when a second passenger boards before the first is dropped off', () => {
    const dinaraPickup = event({ bookingId: 'dinara', fraction: 0.2, timeLabel: '14:03' });
    const alexPickup = event({
      bookingId: 'alex',
      passengerName: 'Alex Martin',
      fraction: 0.4,
      timeLabel: '14:45',
      label: 'Reus',
    });
    const alexDropoff = event({
      bookingId: 'alex',
      kind: 'dropoff',
      passengerName: 'Alex Martin',
      fraction: 0.6,
      timeLabel: '15:52',
      label: 'Girona',
    });
    const dinaraDropoff = event({
      bookingId: 'dinara',
      kind: 'dropoff',
      fraction: 0.8,
      timeLabel: '16:14',
      label: 'Pals, Girona',
    });

    const { nodes, segments } = buildItineraryThread(ORIGIN, DESTINATION, [
      dinaraPickup,
      alexPickup,
      alexDropoff,
      dinaraDropoff,
    ]);

    expect(nodes.map((n) => n.key)).toEqual([
      'origin',
      'pickup-dinara',
      'pickup-alex',
      'dropoff-alex',
      'dropoff-dinara',
      'destination',
    ]);

    const alexPickupNode = nodes.find((n) => n.key === 'pickup-alex')!;
    expect(alexPickupNode.overlapping).toBe(true);
    expect(alexPickupNode.occupiedSeatsAfter).toBe(2);

    const dinaraPickupNode = nodes.find((n) => n.key === 'pickup-dinara')!;
    expect(dinaraPickupNode.overlapping).toBe(false);

    // Legs: origin->dinara pickup (0 onboard), ->alex pickup (1, only Dinara),
    // ->alex dropoff (2, both), ->dinara dropoff (1, only Dinara), ->destination (0).
    expect(segments.map((s) => s.onboardSeats)).toEqual([0, 1, 2, 1, 0]);
  });

  it('sums multi-seat bookings into occupancy instead of counting passengers as 1 seat each', () => {
    const pickup = event({ bookingId: 'group', seatsRequested: 2, fraction: 0.3 });
    const dropoff = event({
      bookingId: 'group',
      kind: 'dropoff',
      seatsRequested: 2,
      fraction: 0.6,
      label: 'Girona',
    });

    const { segments } = buildItineraryThread(ORIGIN, DESTINATION, [pickup, dropoff]);
    expect(segments.map((s) => s.onboardSeats)).toEqual([0, 2, 0]);
  });

  it('attaches the onboard range to the dropoff node when the pickup coincides with the ride origin', () => {
    const dropoffOnly = event({
      kind: 'dropoff',
      bookingId: 'boarded-at-origin',
      fraction: 0.5,
      timeLabel: '15:00',
      label: 'Girona',
    });

    const { nodes } = buildItineraryThread(ORIGIN, DESTINATION, [dropoffOnly]);
    const dropoffNode = nodes.find((n) => n.kind === 'dropoff')!;
    expect(dropoffNode.onboardRange).toEqual({ from: '12:45', to: '15:00' });
  });

  it('sorts out-of-order events by route fraction, not input order', () => {
    const later = event({ bookingId: 'later', fraction: 0.9, label: 'late stop' });
    const earlier = event({ bookingId: 'earlier', fraction: 0.1, label: 'early stop' });

    const { nodes } = buildItineraryThread(ORIGIN, DESTINATION, [later, earlier]);
    expect(nodes.map((n) => n.placeLabel)).toEqual([
      ORIGIN.label,
      'early stop',
      'late stop',
      DESTINATION.label,
    ]);
  });

  it('with no accepted-passenger events, the thread is just origin followed by destination', () => {
    const { nodes, segments } = buildItineraryThread(ORIGIN, DESTINATION, []);
    expect(nodes.map((n) => n.kind)).toEqual(['origin', 'destination']);
    expect(segments).toEqual([{ fromKey: 'origin', toKey: 'destination', onboardSeats: 0 }]);
  });
});
