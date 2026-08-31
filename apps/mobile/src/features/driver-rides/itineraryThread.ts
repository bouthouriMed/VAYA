/**
 * Pure sequencing/occupancy math behind the driver ride-hub's threaded
 * itinerary (2026-08-31 overlap-clarity fix). No React, no network —
 * deterministic given its inputs so it unit-tests without mocks, same
 * convention as myRidesHelpers.ts.
 *
 * The real gap this closes: driver/rides/[rideId].tsx's `passengerItineraryPoints`
 * was already a real, route-order-sorted flat list of every accepted
 * passenger's own pickup/dropoff point — but rendered as a flat list, a
 * ride with two overlapping passengers (one picked up before the other is
 * dropped off) showed no signal that the car is ever carrying both at
 * once. This module turns that same flat, already-sorted list into an
 * ordered node thread plus a per-leg onboard-seat count, so the screen can
 * color each leg by how full the car actually is and flag the exact
 * moment a second passenger boards while the first is still aboard.
 */

export interface ItineraryStopEvent {
  bookingId: string;
  kind: 'pickup' | 'dropoff';
  lat: number;
  lng: number;
  label: string;
  passengerName: string;
  avatarUrl: string | null;
  riderId: string | null;
  seatsRequested: number;
  /** 0..1 route-order position (utils/polyline.ts's routeOrderFraction) —
   *  the caller already computes this against the real decoded route, this
   *  module only needs the ordering it produces. */
  fraction: number;
  /** Real OSRM/Google-duration-derived ETA, or null for a haversine-fallback
   *  route — never a fabricated time (see estimateArrivalLabel's own doc). */
  timeLabel: string | null;
}

export interface ItineraryEndpoint {
  lat: number;
  lng: number;
  label: string;
  timeLabel: string | null;
  /** The driver's real confirmed pickup/dropoff stop, when it differs from
   *  this generic origin/destination label — passed straight through onto
   *  the node, same distinction driver/rides/[rideId].tsx already drew
   *  before this module existed. */
  subLabel?: string;
}

export interface ItineraryThreadNode {
  key: string;
  kind: 'origin' | 'destination' | 'pickup' | 'dropoff';
  lat: number;
  lng: number;
  placeLabel: string;
  timeLabel: string | null;
  passengerName?: string;
  avatarUrl?: string | null;
  riderId?: string | null;
  bookingId?: string;
  seatsRequested?: number;
  subLabel?: string;
  /** Seats occupied in the car for the leg starting right after this node
   *  (i.e. already reflects this node's own pickup/dropoff effect). */
  occupiedSeatsAfter: number;
  /** True only for a pickup whose booking boards while at least one other
   *  passenger is already aboard — the exact moment the flat list used to
   *  hide. */
  overlapping: boolean;
  /** This booking's full onboard window, when both ends are known —
   *  pre-formatted time strings only, no i18n (the caller renders these
   *  through its own translated template). Attached to the pickup node
   *  when the booking has one in this thread, otherwise to the dropoff
   *  node (a passenger whose own pickup coincides with the ride's origin
   *  and so has no separate pickup node here). */
  onboardRange?: { from: string; to: string };
}

export interface ItineraryThreadSegment {
  fromKey: string;
  toKey: string;
  onboardSeats: number;
}

export interface ItineraryThread {
  nodes: ItineraryThreadNode[];
  segments: ItineraryThreadSegment[];
}

/**
 * Builds the origin → events → destination node thread and, for each leg
 * between consecutive nodes, how many seats are occupied while the car
 * travels it. `events` need not be pre-sorted — this sorts by `fraction`
 * itself, same ascending order the screen's old flat list already used.
 */
export function buildItineraryThread(
  origin: ItineraryEndpoint,
  destination: ItineraryEndpoint,
  events: ItineraryStopEvent[],
): ItineraryThread {
  const sorted = [...events].sort((a, b) => a.fraction - b.fraction);

  // First pass: find each booking's pickup/dropoff time (when present in
  // this thread) so onboardRange can be attached without a second lookup.
  const pickupTimeByBooking = new Map<string, string | null>();
  const dropoffTimeByBooking = new Map<string, string | null>();
  for (const e of sorted) {
    if (e.kind === 'pickup') pickupTimeByBooking.set(e.bookingId, e.timeLabel);
    else dropoffTimeByBooking.set(e.bookingId, e.timeLabel);
  }

  const nodes: ItineraryThreadNode[] = [
    {
      key: 'origin',
      kind: 'origin',
      lat: origin.lat,
      lng: origin.lng,
      placeLabel: origin.label,
      timeLabel: origin.timeLabel,
      subLabel: origin.subLabel,
      occupiedSeatsAfter: 0,
      overlapping: false,
    },
  ];

  let occupied = 0;
  for (const e of sorted) {
    const occupiedBefore = occupied;
    occupied += e.kind === 'pickup' ? e.seatsRequested : -e.seatsRequested;

    const hasPickupNode = pickupTimeByBooking.has(e.bookingId);
    const hasDropoffNode = dropoffTimeByBooking.has(e.bookingId);
    let onboardRange: { from: string; to: string } | undefined;
    if (e.kind === 'pickup' && e.timeLabel) {
      const to = hasDropoffNode ? dropoffTimeByBooking.get(e.bookingId)! : destination.timeLabel;
      if (to) onboardRange = { from: e.timeLabel, to };
    } else if (e.kind === 'dropoff' && !hasPickupNode && e.timeLabel) {
      // This booking's pickup coincides with the ride's own origin (never
      // got its own node) — attach the range to the dropoff instead.
      const from = origin.timeLabel;
      if (from) onboardRange = { from, to: e.timeLabel };
    }

    nodes.push({
      key: `${e.kind}-${e.bookingId}`,
      kind: e.kind,
      lat: e.lat,
      lng: e.lng,
      placeLabel: e.label,
      timeLabel: e.timeLabel,
      passengerName: e.passengerName,
      avatarUrl: e.avatarUrl,
      riderId: e.riderId,
      bookingId: e.bookingId,
      seatsRequested: e.seatsRequested,
      occupiedSeatsAfter: occupied,
      overlapping: e.kind === 'pickup' && occupiedBefore > 0,
      onboardRange,
    });
  }

  nodes.push({
    key: 'destination',
    kind: 'destination',
    lat: destination.lat,
    lng: destination.lng,
    placeLabel: destination.label,
    timeLabel: destination.timeLabel,
    subLabel: destination.subLabel,
    occupiedSeatsAfter: occupied,
    overlapping: false,
  });

  const segments: ItineraryThreadSegment[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    segments.push({
      fromKey: nodes[i]!.key,
      toKey: nodes[i + 1]!.key,
      onboardSeats: nodes[i]!.occupiedSeatsAfter,
    });
  }

  return { nodes, segments };
}
