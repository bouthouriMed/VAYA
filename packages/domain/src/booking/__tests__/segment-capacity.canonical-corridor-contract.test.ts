import { describe, it, expect } from 'vitest';
import { computeMaxConcurrentSeats, wouldExceedCapacity, type BookingSegment } from '../segment-capacity';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md INV-02, M-080,
 * M-081 pure-logic part, EDGE-055, §44 regression-protection list) — spec
 * §25 "Segment-Based Capacity" and §26 "Continuous Passenger Turnover",
 * using the canonical Madrid(seq 0) -> Zaragoza(seq 1) -> Lleida(seq 2) ->
 * Barcelona(seq 3) corridor's stop-sequence ordering.
 *
 * This is the ALREADY-CORRECT system §44 calls out for protection, not a
 * gap — `computeMaxConcurrentSeats`/`wouldExceedCapacity` are real, pure,
 * and already proven against a real-Postgres integration test elsewhere
 * (bookings-segment-capacity.integration.test.ts). This file adds the
 * canonical-corridor version of that same proof as a fast, DB-free
 * regression guard, plus the spec's own literal example numbers.
 */
const SEQ = { madrid: 0, zaragoza: 1, lleida: 2, barcelona: 3 } as const;

describe('segment-capacity — canonical corridor (spec §25/§26 literal example)', () => {
  it('spec §25 literal example: 2 seats total — A (Madrid->Zaragoza) frees its seat before B and C (both Zaragoza->Barcelona) need it', () => {
    const seatsTotal = 2;
    const a: BookingSegment = { seatsRequested: 1, pickupSequence: SEQ.madrid, dropoffSequence: SEQ.zaragoza };
    const b: BookingSegment = { seatsRequested: 1, pickupSequence: SEQ.zaragoza, dropoffSequence: SEQ.barcelona };
    const c: BookingSegment = { seatsRequested: 1, pickupSequence: SEQ.zaragoza, dropoffSequence: SEQ.barcelona };

    // A naive ride-global scalar (decrement on accept, never re-examine
    // segments) would see 1(A)+1(B)=2 consumed after A and B are both
    // accepted, and reject C outright regardless of A having already
    // alighted at Zaragoza. The real segment-aware model must not.
    expect(wouldExceedCapacity([a, b], c, seatsTotal)).toBe(false);
    expect(computeMaxConcurrentSeats([a, b, c])).toBe(2); // B+C overlap on Zaragoza->Barcelona; A never overlaps either.
  });

  it('rejects a full-route request that would push a segment over capacity even though total requested seats look plausible in isolation', () => {
    const seatsTotal = 2;
    const a: BookingSegment = { seatsRequested: 1, pickupSequence: SEQ.madrid, dropoffSequence: SEQ.zaragoza };
    const b: BookingSegment = { seatsRequested: 1, pickupSequence: SEQ.zaragoza, dropoffSequence: SEQ.barcelona };
    // D wants the full route for 2 seats — overlaps A on Madrid->Zaragoza
    // (1+2=3>2) even though it would fit fine against B alone.
    const d: BookingSegment = { seatsRequested: 2, pickupSequence: SEQ.madrid, dropoffSequence: SEQ.barcelona };

    expect(wouldExceedCapacity([a, b], d, seatsTotal)).toBe(true);
  });

  it('computes the EXACT peak concurrent occupancy for a realistic 4-passenger mix on the full corridor, not merely a value that happens to fit capacity (INV-02)', () => {
    // A naive/regressed implementation could return an inflated-but-still-
    // <=capacity number (e.g. 3 instead of the real 2) and a bare `<=`
    // assertion would never catch it. Worked out by hand from the real
    // segment overlaps: A(Madrid->Zaragoza) never overlaps anyone; B
    // (Zaragoza->Barcelona) and C (Zaragoza->Lleida) both start at Zaragoza
    // right as A ends there (tie-break: A's end is processed before B/C's
    // starts, so A never counts against them) — B+C overlap for one seat
    // each = 2 concurrent. C ends at Lleida exactly as D (Lleida->Barcelona)
    // starts there (same end-before-start tie-break) — so C and D never
    // overlap either. The true peak, at every point along the corridor, is
    // exactly 2 — never 3, even though 3 seats are nominally available.
    const seatsTotal = 3;
    const segments: BookingSegment[] = [
      { seatsRequested: 1, pickupSequence: SEQ.madrid, dropoffSequence: SEQ.zaragoza }, // Passenger A
      { seatsRequested: 1, pickupSequence: SEQ.zaragoza, dropoffSequence: SEQ.barcelona }, // Passenger B
      { seatsRequested: 1, pickupSequence: SEQ.zaragoza, dropoffSequence: SEQ.lleida }, // Passenger C
      { seatsRequested: 1, pickupSequence: SEQ.lleida, dropoffSequence: SEQ.barcelona }, // Passenger D
    ];
    expect(computeMaxConcurrentSeats(segments)).toBe(2);
    expect(computeMaxConcurrentSeats(segments)).toBeLessThanOrEqual(seatsTotal);
  });

  it('a 5th passenger genuinely overlapping both B and C (Zaragoza->Lleida again, a 2-seat request) pushes peak occupancy to exactly the true new value, and is rejected only once it truly exceeds capacity', () => {
    // Same base mix as above (true peak 2), but now a 2-seat request
    // over Zaragoza->Lleida — genuinely stacking on top of both B and C's
    // existing 1-seat occupation of that span. True new peak at Zaragoza is
    // exactly 1(B) + 1(C) + 2(E) = 4.
    const seatsTotal = 3;
    const existing: BookingSegment[] = [
      { seatsRequested: 1, pickupSequence: SEQ.madrid, dropoffSequence: SEQ.zaragoza },
      { seatsRequested: 1, pickupSequence: SEQ.zaragoza, dropoffSequence: SEQ.barcelona },
      { seatsRequested: 1, pickupSequence: SEQ.zaragoza, dropoffSequence: SEQ.lleida },
    ];
    const twoSeatOverlap: BookingSegment = { seatsRequested: 2, pickupSequence: SEQ.zaragoza, dropoffSequence: SEQ.lleida };
    expect(computeMaxConcurrentSeats([...existing, twoSeatOverlap])).toBe(4);
    expect(wouldExceedCapacity(existing, twoSeatOverlap, seatsTotal)).toBe(true); // 4 > 3, correctly rejected.

    // A single-seat version of the same overlap only reaches exactly 3 —
    // exactly at capacity, not over it, so it must be accepted, not rejected.
    const oneSeatOverlap: BookingSegment = { seatsRequested: 1, pickupSequence: SEQ.zaragoza, dropoffSequence: SEQ.lleida };
    expect(computeMaxConcurrentSeats([...existing, oneSeatOverlap])).toBe(3);
    expect(wouldExceedCapacity(existing, oneSeatOverlap, seatsTotal)).toBe(false); // exactly at capacity, not exceeding it.
  });

  it('dropoff-before-pickup tie-break: a booking ending exactly at Zaragoza and another starting exactly at Zaragoza never count as momentarily overlapping (§44 regression)', () => {
    const seatsTotal = 1; // Tightest possible case: if the tie-break were wrong, this would incorrectly reject.
    const endsAtZaragoza: BookingSegment = { seatsRequested: 1, pickupSequence: SEQ.madrid, dropoffSequence: SEQ.zaragoza };
    const startsAtZaragoza: BookingSegment = { seatsRequested: 1, pickupSequence: SEQ.zaragoza, dropoffSequence: SEQ.barcelona };

    expect(wouldExceedCapacity([endsAtZaragoza], startsAtZaragoza, seatsTotal)).toBe(false);
    expect(computeMaxConcurrentSeats([endsAtZaragoza, startsAtZaragoza])).toBe(1);
  });

  it('a free-form (no-stop) full-route booking occupies the entire corridor via the -Infinity/+Infinity sentinels', () => {
    const seatsTotal = 1;
    const freeForm: BookingSegment = { seatsRequested: 1, pickupSequence: -Infinity, dropoffSequence: Infinity };
    const anySegment: BookingSegment = { seatsRequested: 1, pickupSequence: SEQ.zaragoza, dropoffSequence: SEQ.lleida };

    expect(wouldExceedCapacity([freeForm], anySegment, seatsTotal)).toBe(true);
  });
});
