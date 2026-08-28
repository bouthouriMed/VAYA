/**
 * Segment-aware multi-passenger capacity (matching-engine architecture
 * plan §K). Pure logic, no I/O — mirrors the rest of packages/domain's
 * state-machine-style modules (booking-status.ts, cancellation-policy.ts).
 *
 * **The gap this replaces**: `rides.seatsAvailable` was a single
 * ride-global scalar, decremented on accept and restored on cancel —
 * correct for "how many total seats are free right now", wrong for "is
 * this specific segment of the route free". A driver with 4 seats, one
 * passenger already accepted Tunis→Hammamet, genuinely has 4 free seats
 * for a later Hammamet→Sousse request (the first passenger has already
 * alighted by then) — a purely ride-global counter can't express that.
 *
 * **The model**: a booking occupies the ride's stop-sequence timeline from
 * its pickup stop's `sequence` through (not including) its dropoff stop's
 * `sequence` — `route_stops.sequence` is already a strictly-ordered
 * integer per ride (bookings.service.ts's own dropoff-after-pickup check
 * already relies on this). A free-form/no-stop pickup or dropoff (a
 * legacy ride with zero route_stops, or the ride's own destination when no
 * dropoff stop was chosen) occupies from the ride's true start or through
 * to its true end — represented here as the signed-infinity sentinels
 * below rather than a nullable field, so every comparison site stays a
 * plain numeric comparison with no special-casing.
 */
export interface BookingSegment {
  seatsRequested: number;
  /** The route_stop `sequence` this booking's pickup resolves to, or
   *  `-Infinity` for a free-form/no-stop pickup (occupies from the ride's
   *  own origin). */
  pickupSequence: number;
  /** The route_stop `sequence` this booking's dropoff resolves to, or
   *  `+Infinity` for a free-form/no-stop dropoff (occupies through the
   *  ride's own destination). */
  dropoffSequence: number;
}

/**
 * The maximum number of seats simultaneously in use anywhere along the
 * ride's timeline, across every given segment — a sweep-line over each
 * segment's start (+seats) and end (-seats) events. A booking ending
 * exactly where another starts (dropoff at stop X, next pickup also at
 * stop X) does NOT count as overlapping — the earlier passenger has
 * already alighted by the time the next one boards — so at a tied
 * position, "end" events (negative delta) are applied before "start"
 * events (positive delta).
 */
export function computeMaxConcurrentSeats(segments: BookingSegment[]): number {
  if (segments.length === 0) return 0;

  const events: { at: number; delta: number }[] = [];
  for (const segment of segments) {
    events.push({ at: segment.pickupSequence, delta: segment.seatsRequested });
    events.push({ at: segment.dropoffSequence, delta: -segment.seatsRequested });
  }
  // Ties (same position): ends before starts, so a same-stop
  // dropoff/pickup pair never counts as momentarily overlapping.
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);

  let running = 0;
  let max = 0;
  for (const event of events) {
    running += event.delta;
    if (running > max) max = running;
  }
  return max;
}

/**
 * Whether inserting `candidate` alongside every already-`accepted` booking
 * on the ride (`existingSegments`) would push seat occupancy over
 * `seatsTotal` anywhere along the ride's timeline — the real accept-time
 * capacity gate this module exists for. `true` means reject.
 *
 * Deliberately checks the whole timeline, not just `candidate`'s own span:
 * inserting one more interval can only ever raise the max at points within
 * its own span (every other point's occupancy is unchanged), so this is
 * exactly equivalent to — and simpler than — checking only within
 * `candidate`'s span.
 */
export function wouldExceedCapacity(
  existingSegments: BookingSegment[],
  candidate: BookingSegment,
  seatsTotal: number,
): boolean {
  return computeMaxConcurrentSeats([...existingSegments, candidate]) > seatsTotal;
}
