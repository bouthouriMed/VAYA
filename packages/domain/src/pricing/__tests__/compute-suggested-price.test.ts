import { describe, it, expect } from 'vitest';
import { computeSuggestedPrice, ABSOLUTE_MIN_CONTRIBUTION_DT } from '../compute-suggested-price';
import { DEFAULT_PRICING_CONFIG } from '../default-pricing-config';
import type { PricingConfigInput } from '../pricing.types';

const config: PricingConfigInput = DEFAULT_PRICING_CONFIG;

describe('computeSuggestedPrice', () => {
  it('computes a bounded suggestion for a normal route', () => {
    // ~Tunis -> Nabeul: 64.7km / 58min (the codebase's own longest seeded
    // corridor, apps/api/src/db/seed.ts).
    const result = computeSuggestedPrice(64.7, 58, config);

    expect(result.recommended).toBeCloseTo(64.7 * config.baseRatePerKm + 58 * config.timeComponentPerMin, 0);
    expect(result.min).toBeLessThan(result.recommended);
    expect(result.max).toBeGreaterThan(result.recommended);
    expect(result.min).toBeCloseTo(result.recommended * config.minMultiplier, 0);
    expect(result.max).toBeCloseTo(result.recommended * config.maxMultiplier, 0);
  });

  it('enforces the absolute floor for a very short route', () => {
    // A 1km/3min hop: the raw formula (0.25*1 + 0.08*3 = 0.49 DT) is far
    // below any realistic contribution — the floor must take over.
    const result = computeSuggestedPrice(1, 3, config);

    expect(result.recommended).toBe(ABSOLUTE_MIN_CONTRIBUTION_DT);
    expect(result.min).toBeLessThanOrEqual(result.recommended);
    expect(result.max).toBeGreaterThanOrEqual(result.recommended);
    // Multiplier-only bound would have been far below the floor too —
    // confirms the floor, not the multiplier, is what set `min`/`recommended`.
    expect(result.recommended * config.minMultiplier).toBeLessThan(ABSOLUTE_MIN_CONTRIBUTION_DT);
  });

  it('widens the min/max spread when the route is a haversine-fallback estimate', () => {
    const real = computeSuggestedPrice(20, 25, config, { isEstimate: false });
    const estimate = computeSuggestedPrice(20, 25, config, { isEstimate: true });

    // Same recommended (the point estimate doesn't change) but a strictly
    // wider band around it, per docs/domain/pricing.md's "Route not yet
    // computed" edge case.
    expect(estimate.recommended).toBe(real.recommended);
    expect(estimate.min).toBeLessThanOrEqual(real.min);
    expect(estimate.max).toBeGreaterThanOrEqual(real.max);
    expect(estimate.max - estimate.min).toBeGreaterThan(real.max - real.min);
  });

  it('never produces min > recommended or max < recommended after rounding', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [0.4, 1],
      [5.4, 15],
      [200, 150],
    ];
    for (const [distanceKm, durationMin] of cases) {
      const result = computeSuggestedPrice(distanceKm, durationMin, config);
      expect(result.min).toBeLessThanOrEqual(result.recommended);
      expect(result.max).toBeGreaterThanOrEqual(result.recommended);
    }
  });

  it('treats negative inputs as zero rather than producing a negative price', () => {
    const result = computeSuggestedPrice(-5, -10, config);
    expect(result.recommended).toBe(ABSOLUTE_MIN_CONTRIBUTION_DT);
    expect(result.min).toBeGreaterThan(0);
  });
});
