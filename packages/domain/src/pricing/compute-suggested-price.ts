import type { ComputeSuggestedPriceOptions, PricingConfigInput, SuggestedPrice } from './pricing.types';

/**
 * Absolute floor for `recommended` (and, transitively, `min`) regardless of
 * how short the route is — a pure per-km/per-min formula would suggest an
 * unrealistically small number (a fraction of a dinar) for a 1-2km hop,
 * which `docs/domain/pricing.md`'s "Very short rides" edge case explicitly
 * calls out as needing a floor on top of the multiplier-based bound.
 *
 * Value: 4 DT — an independent minimum-viable-contribution judgment, kept
 * unchanged by the 2026-09-15 rate revision (see the doc comment on
 * `DEFAULT_PRICING_CONFIG` below and `docs/domain/pricing.md`'s "Rate
 * derivation" section): no Tunisia-specific research surfaced evidence to
 * move it either way, so it wasn't touched just because `baseRatePerKm`
 * was. Not derived from the current per-km rate — it exists precisely
 * because the per-km/per-min formula alone would suggest an unrealistic
 * near-zero price for a very short hop.
 */
export const ABSOLUTE_MIN_CONTRIBUTION_DT = 4;

/**
 * When the route came from the haversine fallback (OSRM unavailable), the
 * true driving distance/duration is systematically higher than the
 * straight-line estimate — `lib/routing.ts`'s `fallbackRoute` doc comment.
 * Rather than guess a distance-correction factor (which would duplicate
 * routing concerns inside the pricing module), pricing responds to that
 * uncertainty the way `docs/domain/pricing.md` prescribes: widen the
 * min/max spread around the same `recommended` value, so a driver publishing
 * without live OSRM data still gets a usable suggestion, just a less
 * tightly-bounded one.
 */
const FALLBACK_MULTIPLIER_WIDENING = 0.2;

/** Multipliers never collapse the band to nothing, however config is tuned. */
const MIN_MULTIPLIER_FLOOR = 0.1;

const PRICE_ROUNDING_INCREMENT_DT = 0.5;

function roundToIncrement(value: number): number {
  return Math.round(value / PRICE_ROUNDING_INCREMENT_DT) * PRICE_ROUNDING_INCREMENT_DT;
}

/**
 * Pure computation of a bounded price suggestion for a ride, per
 * `docs/domain/pricing.md`'s pricing model:
 *
 *   recommended = baseRatePerKm * distanceKm + timeComponentPerMin * durationMin
 *   min         = recommended * minMultiplier
 *   max         = recommended * maxMultiplier
 *
 * with an absolute floor on `recommended` (`ABSOLUTE_MIN_CONTRIBUTION_DT`)
 * and a widened multiplier spread when `options.isEstimate` is true (the
 * haversine-fallback edge case). No I/O, no DB/network access — matches the
 * rest of `packages/domain`'s pure, state-machine-style modules.
 */
export function computeSuggestedPrice(
  distanceKm: number,
  durationMin: number,
  config: PricingConfigInput,
  options: ComputeSuggestedPriceOptions = {},
): SuggestedPrice {
  const safeDistanceKm = Math.max(0, distanceKm);
  const safeDurationMin = Math.max(0, durationMin);

  const rawRecommended =
    config.baseRatePerKm * safeDistanceKm + config.timeComponentPerMin * safeDurationMin;
  const recommended = Math.max(rawRecommended, ABSOLUTE_MIN_CONTRIBUTION_DT);

  const widening = options.isEstimate ? FALLBACK_MULTIPLIER_WIDENING : 0;
  const minMultiplier = Math.max(MIN_MULTIPLIER_FLOOR, config.minMultiplier - widening);
  const maxMultiplier = config.maxMultiplier + widening;

  const roundedRecommended = roundToIncrement(recommended);
  // Round min/max independently (not off the already-rounded recommended)
  // so the multiplier relationship stays accurate at the DT-rounding
  // granularity, then clamp so rounding can never invert min <= recommended
  // <= max at the edges.
  const roundedMin = Math.min(roundToIncrement(recommended * minMultiplier), roundedRecommended);
  const roundedMax = Math.max(roundToIncrement(recommended * maxMultiplier), roundedRecommended);

  return {
    min: roundedMin,
    recommended: roundedRecommended,
    max: roundedMax,
  };
}
