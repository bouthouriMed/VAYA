import type { PricingConfigInput } from './pricing.types';

/**
 * `national` pricing config — revised 2026-09-15 with real, sourced Tunisia
 * research, superseding the Phase 6 first-cut. Still explicitly a first-cut
 * pending real business/market confirmation, not a settled number — see
 * `docs/domain/pricing.md`'s "Rate derivation" section for the full
 * writeup, sourcing, and the two open questions this revision surfaced but
 * deliberately did not resolve on its own (below).
 *
 * **What changed and why:**
 * - Fuel-cost input refined from a single petrol-only estimate to a
 *   fleet-weighted, diesel-inclusive one: Tunisia's private-car fleet is
 *   roughly 74% petrol / 26% diesel (ANME survey; dated, no more recent
 *   split found), at ≈2.53 DT/L petrol / ≈2.21 DT/L diesel and
 *   ≈7.7L/100km petrol / ≈7L/100km diesel consumption. Blended:
 *   0.74×(7.7/100×2.53) + 0.26×(7/100×2.21) ≈ **0.184 DT/km** — almost
 *   identical to the Phase 6 session's petrol-only 0.18 DT/km estimate, so
 *   this is a genuine independent reconfirmation of that number, not an
 *   overturn.
 * - **New finding that did change something**: Tunisia's regulated louage
 *   (shared-taxi) per-passenger tariff is ≈0.086 DT/km (10-150km) /
 *   ≈0.071 DT/km (>150km), plus a small flat base fare — a directly
 *   comparable, government-set reference for what a per-seat shared-ride
 *   price looks like in this market (source: Ministry of Transport tariff
 *   decree, effective 15 Dec 2022, cross-validated against real reported
 *   fares for Tunis-Sousse/Nabeul/Hammamet). The Phase 6 rate's 1.35x
 *   markup over pure fuel cost (→ 0.25 DT/km) sits meaningfully *above*
 *   this benchmark once the time component is added — in tension with
 *   Article 4 of `docs/legal/terms-and-conditions.md`, which stakes VAYA's
 *   entire legal framing on the Contribution staying well under a
 *   commercial/regulated transport fare, not resembling or exceeding one.
 *   The markup here is pulled back to ~1.1x (0.184 × 1.1 ≈ 0.20,
 *   `baseRatePerKm`) and `timeComponentPerMin` scaled down in the same
 *   proportion (0.08 × 0.20/0.25 = 0.064, rounded to 0.06) to narrow that
 *   gap — a real, evidence-driven correction, not a cosmetic rounding.
 *
 * **What this revision deliberately does NOT resolve** (a future phase's
 * decision, not invented here):
 * 1. This per-seat rate is still occupancy-blind — `computeSuggestedPrice`
 *    has no notion of how many seats a ride offers or fills, so a fully
 *    occupied ride collects `recommended × seatsFilled`, which can still
 *    exceed the louage per-passenger benchmark (and, at the extreme, the
 *    car's real total trip cost) for a well-filled ride on a long corridor.
 *    Closing this gap for real would mean pricing per seat as a share of
 *    total trip cost divided by expected occupancy, not a flat per-km
 *    rate — a genuine formula-shape change, not a constant tweak, and
 *    explicitly out of scope for this pass.
 * 2. No concrete Tunisia-specific informal-carpooling price data (Facebook
 *    covoiturage groups, or a public SPLIT per-km rate) could be found
 *    despite a real search attempt — the one data source that would most
 *    directly validate "what Tunisians actually consider a fair
 *    contribution" remains unavailable, so this revision leans on the
 *    fuel-cost/louage-benchmark math instead, honestly, not because that's
 *    the ideal source.
 *
 * Full sourcing, the louage-tariff sanity check against real routes, and
 * both open items above: `docs/domain/pricing.md`.
 */
export const DEFAULT_PRICING_CONFIG: PricingConfigInput = {
  baseRatePerKm: 0.2,
  timeComponentPerMin: 0.06,
  minMultiplier: 0.7,
  maxMultiplier: 1.3,
};
