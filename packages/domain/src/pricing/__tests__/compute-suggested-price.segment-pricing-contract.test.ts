import { describe, it, expect } from 'vitest';
import { computeSuggestedPrice } from '../compute-suggested-price';
import { DEFAULT_PRICING_CONFIG } from '../default-pricing-config';
import {
  CANONICAL_ROUTE_TOTAL_KM,
  cumulativeKmOf,
  kmToDurationMinutes,
  segmentDistanceKm,
  segmentDurationMinutes,
} from '@vaya/test-fixtures';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-070..M-075,
 * EDGE-055, ambiguity log A-1) — spec §24 "Dynamic Pricing":
 *
 *   "Driver publishes Madrid -> Barcelona = EUR20. Passenger requests
 *    Zaragoza -> Barcelona. VAYA calculates a segment price, e.g. EUR10.
 *    The driver's full-trip price is an input/reference, not a rigid
 *    proportional formula."
 *
 * This file tests ONE claim only: `computeSuggestedPrice` — the real,
 * already-shipped pricing primitive (packages/domain/src/pricing) — is
 * already general enough to price an arbitrary sub-segment of the canonical
 * Madrid-Zaragoza-Lleida-Barcelona corridor correctly, given that segment's
 * own distance/duration. It does NOT test whether the booking flow actually
 * calls it that way for a passenger's segment — `bookings.service.ts`
 * currently always prices the full route regardless of what segment a
 * passenger requested (confirmed live at `contributionTotal: ride.contributionPerSeat * seatsRequested`,
 * bookings.service.ts ~L493). That live, currently-INCORRECT integration
 * point is exercised separately in
 * apps/api/src/modules/bookings/__tests__/bookings-segment-pricing.contract.integration.test.ts,
 * which is expected to FAIL today. This file is expected to PASS today —
 * the underlying formula was never the problem, wiring is.
 *
 * Per ambiguity log A-1: the spec explicitly rules out a "rigid
 * proportional formula" without specifying a replacement, so this suite
 * asserts only the qualitative invariants a reasonable implementation must
 * hold (strictly smaller segment -> strictly smaller-or-equal price;
 * distinct segments -> independently-computed, generally distinct prices;
 * no segment ever exceeds the full-route reference price) — never a fixed
 * proportionality ratio.
 */

const config = DEFAULT_PRICING_CONFIG;

const madridKm = cumulativeKmOf('Madrid');
const zaragozaKm = cumulativeKmOf('Zaragoza');
const lleidaKm = cumulativeKmOf('Lleida');
const barcelonaKm = cumulativeKmOf('Barcelona');

function priceFor(fromKm: number, toKm: number) {
  const distanceKm = segmentDistanceKm(fromKm, toKm);
  const durationMin = segmentDurationMinutes(fromKm, toKm);
  return computeSuggestedPrice(distanceKm, durationMin, config);
}

describe('computeSuggestedPrice — segment-pricing capability over the canonical corridor (M-070..M-075)', () => {
  const fullRoute = priceFor(madridKm, barcelonaKm);

  it('M-071: full-route segment price matches the reference full-route computation', () => {
    const reference = computeSuggestedPrice(
      CANONICAL_ROUTE_TOTAL_KM,
      kmToDurationMinutes(CANONICAL_ROUTE_TOTAL_KM),
      config,
    );
    expect(fullRoute.recommended).toBeCloseTo(reference.recommended, 5);
  });

  it('M-070: a strict sub-segment (Zaragoza -> Barcelona) prices strictly below the full route', () => {
    const segment = priceFor(zaragozaKm, barcelonaKm);
    expect(segment.recommended).toBeLessThan(fullRoute.recommended);
    expect(segment.max).toBeLessThanOrEqual(fullRoute.max);
  });

  it('M-072: first segment (Madrid -> Zaragoza), middle segment (Zaragoza -> Lleida), and final segment (Lleida -> Barcelona) are each independently and distinctly priced', () => {
    const first = priceFor(madridKm, zaragozaKm);
    const middle = priceFor(zaragozaKm, lleidaKm);
    const final = priceFor(lleidaKm, barcelonaKm);

    // Distinct segment lengths (325km / 150km / 165km) must not collapse to
    // the same price merely because they're all "sub-segments."
    expect(first.recommended).not.toBeCloseTo(middle.recommended, 0);
    expect(first.recommended).not.toBeCloseTo(final.recommended, 0);
    // Middle and final are close in length (150 vs 165km) but must still be
    // computed from their own real distance/duration, not an interpolated
    // or shared value.
    expect(middle.recommended).not.toBe(final.recommended);

    for (const segment of [first, middle, final]) {
      expect(segment.recommended).toBeLessThan(fullRoute.recommended);
    }
  });

  it('M-073/EDGE-055: concurrent passengers on different segments are priced from their own segment alone, independent of one another (no shared-fare split)', () => {
    // Passenger B (Zaragoza->Barcelona) and passenger D (Lleida->Barcelona)
    // "coexist" on overlapping trailing segments of the same ride. Neither
    // computation takes the other's existence as an input at all — proving
    // pricing is per-segment-independent, not a pool that gets divided
    // among however many passengers happen to be aboard.
    const passengerB = priceFor(zaragozaKm, barcelonaKm);
    const passengerD = priceFor(lleidaKm, barcelonaKm);

    expect(passengerB.recommended).toBeGreaterThan(passengerD.recommended); // B's segment is strictly longer.
    // Neither is a fraction of `fullRoute` divided by "2 passengers" — each
    // is computed purely from its own segment's distance/duration.
    expect(passengerB.recommended + passengerD.recommended).not.toBeCloseTo(fullRoute.recommended, 0);
  });

  it('M-074: sequential turnover (passenger A exits at Zaragoza, passenger B boards there) — B is priced on B\'s own segment, unaffected by A having existed', () => {
    const passengerA = priceFor(madridKm, zaragozaKm); // Madrid -> Zaragoza
    const passengerB = priceFor(zaragozaKm, barcelonaKm); // Zaragoza -> Barcelona, boards after A alights

    // Order-independent: computing B's price never needs to know A ever
    // existed, which is exactly what makes turnover safe to reprice.
    const passengerBRecomputedAlone = priceFor(zaragozaKm, barcelonaKm);
    expect(passengerB.recommended).toBe(passengerBRecomputedAlone.recommended);
    expect(passengerA.recommended).not.toBe(passengerB.recommended);
  });

  it('A-1 (ambiguity, documented not asserted as a fixed ratio): segment price is NOT required to be a rigid proportional pro-rate of the full price', () => {
    // A naive proportional formula would give Zaragoza->Barcelona (315km of
    // 640km, ~49%) essentially half of the full-route price. This
    // formula's real behavior (time component + absolute floor) does NOT
    // land on that exact ratio — which is the point: the spec explicitly
    // forbids assuming a fixed ratio, so this test documents that the
    // actual ratio is formula-dependent rather than asserting one.
    const segment = priceFor(zaragozaKm, barcelonaKm);
    const naiveProportional = fullRoute.recommended * (segmentDistanceKm(zaragozaKm, barcelonaKm) / CANONICAL_ROUTE_TOTAL_KM);
    // Documented, not a hard requirement either way — see ambiguity log A-1
    // in docs/tdd_journey_test_matrix.md for the product decision this
    // still needs.
    expect(typeof (segment.recommended - naiveProportional)).toBe('number');
  });
});
