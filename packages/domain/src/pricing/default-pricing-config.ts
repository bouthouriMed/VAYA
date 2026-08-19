import type { PricingConfigInput } from './pricing.types';

/**
 * First-cut, business-review-pending Tunisian `national` pricing config.
 *
 * `docs/roadmap/README.md`'s Open Decision #2 flags `base_rate_per_km` as
 * requiring real Tunisian fuel-price/market input, not a blind inheritance
 * of BlaBlaCar's €0.06/km. Running autonomously with no human available to
 * consult (Phase 6 session), here is the derivation actually used — full
 * writeup in `docs/domain/pricing.md`'s "Rate derivation" section:
 *
 * - Typical Tunisian petrol price ≈ 2.5-2.6 DT/L (approximate — this is the
 *   one input in this formula most likely to need a real update; Tunisian
 *   fuel prices are administratively revised and have moved several times
 *   in recent years).
 * - Typical small/compact-car consumption (matches this app's own seeded
 *   vehicle fleet — Peugeot 208/301, Renault Clio, Dacia Logan, Kia
 *   Picanto, VW Golf, Hyundai i10) ≈ 7L/100km.
 * - Pure fuel cost ≈ (7/100) * 2.55 ≈ 0.18 DT/km.
 * - VAYA is cost-sharing, not commercial dispatch (`docs/domain/pricing.md`)
 *   — carpooling contribution formulas typically markup modestly over pure
 *   fuel cost to also loosely cover wear/tolls, while staying well under a
 *   commercial per-km fare (taxi/louage) to preserve that legal/social
 *   framing. A ~1.35x markup on fuel cost: 0.18 * 1.35 ≈ 0.24, rounded to
 *   0.25 DT/km.
 * - Sanity check against this codebase's own pre-existing hand-authored
 *   `routes` seed data (`apps/api/src/db/seed.ts`, pre-Phase-6): the
 *   longest seeded corridor (Tunis→Nabeul, ~65km/58min) was hand-priced at
 *   20 DT recommended. This formula (0.25 DT/km + 0.08 DT/min time
 *   component) produces ≈20.8 DT for the same distance/duration — closely
 *   matching a number a human already judged reasonable for that corridor,
 *   which is the best available signal in the absence of real market data.
 *
 * This is a defensible starting point, not a business decision made final
 * by an engineering session — see `docs/domain/pricing.md` and
 * `docs/roadmap/README.md`'s Open Decision #2, both marked "first-cut value
 * in place, needs business confirmation."
 */
export const DEFAULT_PRICING_CONFIG: PricingConfigInput = {
  baseRatePerKm: 0.25,
  timeComponentPerMin: 0.08,
  minMultiplier: 0.7,
  maxMultiplier: 1.3,
};
