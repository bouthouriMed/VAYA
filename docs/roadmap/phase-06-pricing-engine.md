# Phase 6 — Pricing Engine

**Horizon:** NOW · **Estimated complexity:** Medium

## Objective

Replace unconstrained driver-typed pricing with a computed, bounded suggestion, per the full design in `docs/domain/pricing.md`. Closes a confirmed gap: today `driver/publish.tsx` lets a driver enter any price with no ceiling and no server-side bound enforcement.

## Prerequisites

Phase 1 (booking integrity should land first since pricing changes touch the same booking-creation path). Independent of Phases 3-5 (can run in parallel), though more accurate once route/stop data exists.

## Exact scope

1. New `packages/domain/src/pricing` module: pure computation logic (`computeSuggestedPrice(distanceKm, durationMin, config) → {min, recommended, max}`), following the existing `packages/domain` pattern (state-machine-style pure functions, no I/O).
2. New `pricing_configs` table (schema in `docs/domain/pricing.md`), seeded with one `national` scope row.
3. Backend: `apps/api/src/modules/rides/rides.service.ts` calls the new pricing module at ride-creation time (after OSRM route is computed) to produce the suggested bounds; `packages/validation/src`'s ride-creation schema enforces `contributionPerSeat` falls within `[min, max]` server-side.
4. Mobile: replace `driver/publish.tsx`'s unbounded price stepper with a bounded control (slider or capped stepper) pre-filled with the recommended value, visually showing the min/max range.
5. Passenger-facing: ensure `search/results.tsx`/`trust.tsx` display `contributionPerSeat` plainly (already does per the audit — verify no changes needed) with room reserved for a future fee line (not activated in this phase).

## User flows

Driver flow (`docs/ux/driver-journey.md` §1, step 6): route (and, if Phase 4/5 shipped, stops) computed → **suggested price shown, adjustable within bounds** → seats/preferences → publish. Passenger flow unchanged visually, but the number shown is now a real computed value instead of an arbitrary driver entry.

## Screens

`driver/publish.tsx` (price step rewritten). No new screens.

## UX behavior

- Recommended price pre-filled, clearly labeled as a suggestion.
- Adjustment control visually communicates the bound (e.g. slider track spans exactly `[min, max]`, can't drag past either end) — no separate validation-error state should ever be reachable for price, since the UI makes an out-of-bounds value unrepresentable.
- If route/OSRM data isn't yet available (haversine fallback in effect), the suggestion still appears but the bound is wider, per `docs/domain/pricing.md`'s edge case — don't block publish waiting on real routing data.

## Design-system work

A bounded slider/range-stepper primitive if one doesn't already exist from Phase 2 — small addition to the primitive set if needed, reuse `Input`'s numeric-entry pattern where possible rather than inventing a new visual language.

## Frontend

`apps/mobile/app/driver/publish.tsx`, `apps/mobile/src/state` (whichever slice holds ride-creation draft state).

## Backend

`packages/domain/src/pricing/*` (new), `apps/api/src/modules/rides/rides.service.ts` (call the pricing module), `packages/validation/src` (bound enforcement on `contributionPerSeat`), `apps/api/src/db/seed.ts` (backfill: derive existing seeded `routes` rows' min/recommended/max from the new formula instead of hand-authored values, or explicitly keep them as an intentional override — decide and document which, don't leave both mechanisms silently disagreeing).

## Database

Migration adding `pricing_configs` (schema in `docs/domain/pricing.md`), seeded with one active `national` row. No changes to `rides`/`bookings`/`routes` column shapes — `contributionPerSeat`/`contributionTotal` already exist and are reused as-is.

## API

`POST /rides` (or wherever ride creation lives) response includes the computed `{min, recommended, max}` alongside the created ride, so the client can render the bound without a second round-trip. Validation: `contributionPerSeat` outside `[min, max]` → 400 with a clear message, not a generic validation error.

## Business rules

- Server-side bound enforcement is authoritative — client-side slider clamping is a UX convenience, never the only enforcement (a direct API call with an out-of-bounds price must still be rejected).
- Fee computation logic (present in `pricing_configs` as `platformFeeRate`, defaulted to 0) must not be activated as part of this phase — this phase ships the mechanism, not a monetization decision.
- `recommendedContribution` must respect an absolute minimum floor for very short rides (`docs/domain/pricing.md` edge case), not just the multiplier-based bound.

## Testing

- Unit tests for `computeSuggestedPrice` covering: normal route, very short route (floor case), missing route data (haversine-fallback wider-bound case).
- Integration test confirming the API rejects an out-of-bounds `contributionPerSeat` on ride creation.
- Mobile test confirming the price control cannot produce an out-of-bounds value.

## Analytics

- `ride_price_suggested` (recommended value, min, max — for later analysis of whether the formula's `base_rate_per_km` needs tuning).
- `ride_price_adjusted_from_suggestion` (delta from recommended — signals whether drivers consistently push toward min or max, useful market-calibration data).

## Definition of Done

- [ ] `pricing_configs` table exists, seeded with a deliberately chosen (documented, not arbitrary) `base_rate_per_km`.
- [ ] Ride creation computes and returns suggested bounds; `driver/publish.tsx` uses them instead of an unbounded stepper.
- [ ] Server rejects out-of-bounds prices independent of client behavior.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Dependencies

Independent of the ride-engine phases but should land before any real driver onboarding push, since unconstrained pricing is one of the two highest-risk gaps identified in the audit (alongside the fake pickup-point screen).

## Risks

The actual `base_rate_per_km` number is a business decision requiring real Tunisian fuel-price/market input, not something to derive from BlaBlaCar's €0.06/km without adjustment (see `docs/product/benchmark.md` §4 caveat). Flag this explicitly as an open decision to resolve with the user before or during this phase, not something to silently pick a number for.
