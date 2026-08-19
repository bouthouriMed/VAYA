/** Shape of an active `pricing_configs` row, as consumed by
 *  `computeSuggestedPrice` — deliberately a plain structural type, not an
 *  import of the Drizzle-inferred row type, so this module stays what the
 *  rest of `packages/domain` is: pure computation with zero I/O or
 *  framework coupling (see `docs/domain/pricing.md`). `apps/api`'s
 *  `pricing.service.ts` maps the DB row onto this shape. `platformFeeRate`
 *  is intentionally not read by `computeSuggestedPrice` — fee computation
 *  is out of scope for Phase 6 (mechanism only, not activated).
 */
export interface PricingConfigInput {
  /** DT per kilometre of route distance. */
  baseRatePerKm: number;
  /** DT per minute of route duration. */
  timeComponentPerMin: number;
  /** Multiplier applied to `recommended` to derive `min` (e.g. 0.7). */
  minMultiplier: number;
  /** Multiplier applied to `recommended` to derive `max` (e.g. 1.3). */
  maxMultiplier: number;
}

export interface SuggestedPrice {
  min: number;
  recommended: number;
  max: number;
}

export interface ComputeSuggestedPriceOptions {
  /** True when `distanceKm`/`durationMin` came from the haversine fallback
   *  (`lib/routing.ts`'s `RouteResult.isEstimate`) rather than a real OSRM
   *  route — widens the min/max spread per `docs/domain/pricing.md`'s
   *  "Route not yet computed" edge case, since haversine systematically
   *  underestimates real driving distance/duration. Defaults to false
   *  (treat the input as a real, trustworthy route). */
  isEstimate?: boolean;
}
