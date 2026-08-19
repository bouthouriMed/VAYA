# Pricing Architecture

## Current state (confirmed, not assumed)

`routes.minContribution/recommendedContribution/maxContribution` exist as columns but are hardcoded per-route in `apps/api/src/db/seed.ts` — no formula computes them anywhere in the codebase (`docs/product/audit.md` §3). `validation/rides.ts` only requires `contributionPerSeat` to be a positive number; nothing ties a driver's entered price to their route's bounds. `driver/publish.tsx` lets a driver type any price with a stepper starting at 5 DT, ±1, no ceiling (`docs/product/audit.md` §4). This is a real gap, not a hypothetical one — it must be fixed before any real driver uses the app.

## Design goals

1. Drivers never invent a price from nothing — they always see a computed suggestion first.
2. Drivers retain agency (this is a cost-sharing marketplace, not a fixed-price dispatch system) — bounded adjustment, not a locked price.
3. Passengers see one transparent number before booking — no surprise fees added at checkout.
4. The formula and bounds are configuration, not code — must be tunable per region/route-class without a deploy, because VAYA will need to tune this as it learns the Tunisian market (`docs/product/benchmark.md` §8 flags this as a genuine local-knowledge gap today).

## Pricing model

Directly informed by the benchmark (`docs/product/benchmark.md` §4): a **cost-sharing formula with a bounded range**, not a demand-based/surge system. VAYA's own `routes` schema already anticipated this shape (`minContribution`/`recommendedContribution`/`maxContribution`) — the work is computing those three numbers instead of hand-typing them.

```
recommendedContribution = baseRate × distanceKm + timeComponent × durationMin
minContribution         = recommendedContribution × MIN_MULTIPLIER   (e.g. 0.7)
maxContribution         = recommendedContribution × MAX_MULTIPLIER   (e.g. 1.3)
```

- `distanceKm`/`durationMin` come from the real OSRM route (`rides.routePolyline`/`estimatedDurationSec`, already computed at ride-creation time — no new routing call needed).
- `baseRate` (DT/km) and `timeComponent`, plus `MIN_MULTIPLIER`/`MAX_MULTIPLIER`, live in a new `pricing_configs` table (see below), not hardcoded constants — Tunisia-wide to start, with room to specialize by region later without a schema change.
- Per-seat: `contributionPerSeat = recommendedContribution` (or the driver's bounded adjustment); `bookings.contributionTotal = contributionPerSeat × seatsRequested`, matching the existing schema shape.

## Driver-facing behavior

- At ride creation, once route (and, once shipped, stops — `docs/domain/ride-engine.md`) is set, show the computed `recommendedContribution` as the pre-filled price.
- Allow adjustment only within `[minContribution, maxContribution]` — replace the current unbounded stepper with a bounded control (slider or stepper with a visible/enforced ceiling and floor), per `docs/design-system/README.md`'s missing-primitives list.
- Server-side validation (`packages/validation`) must independently enforce the same bounds — never trust client-side clamping alone. This closes the exact gap the audit found in `validation/rides.ts`.

## Passenger-facing behavior

- Show the ride's actual `contributionPerSeat` plainly in search results and the trust/booking screen — no separate "fee" line unless a platform fee is introduced (see below), in which case show base fare + fee separately and a clear total, mirroring BlaBlaCar's passenger-side fee transparency (`docs/product/benchmark.md` §4).

## Platform fee — architecture, not activation

VAYA has no monetization mechanism today, and this document does not recommend turning one on. It defines where the mechanism belongs so it can be enabled later without a redesign:

- A `platformFeeRate` (or flat fee) field on `pricing_configs`, defaulted to `0`.
- If/when activated, apply it passenger-side (charged on top of `contributionPerSeat`, driver still receives the full listed amount), matching the benchmark model — this preserves the cost-sharing framing that keeps pricing legally/socially distinct from commercial dispatch pricing.
- Fee computation belongs in the pricing/booking service layer (`packages/domain` + `apps/api/src/modules/bookings`), never in the mobile client — the client only ever displays a server-computed total.

## Database: `pricing_configs` (new)

```
pricing_configs
  id                  uuid PK
  scope               varchar(30)     -- 'national' | 'region' | 'route' (start with 'national' only)
  scope_ref_id        uuid nullable   -- FK to a route or region id when scope != 'national'
  base_rate_per_km    double precision
  time_component_per_min double precision
  min_multiplier      double precision  -- e.g. 0.7
  max_multiplier      double precision  -- e.g. 1.3
  platform_fee_rate   double precision default 0
  active              boolean default true
  created_at, updated_at
```

Start with a single `national` row seeded with a deliberately chosen `base_rate_per_km` (a product/business decision to make explicitly, not inherit from BlaBlaCar's €0.06/km without adjusting for Tunisian fuel prices and currency — flag this as an open decision in `CLAUDE.md`, not something this document should invent a number for).

## Where pricing logic belongs

Per CLAUDE.md's architecture rules: pricing computation is business logic and belongs in `packages/domain` (a new `pricing` module, alongside the existing `booking`/`ride` modules), consumed by `apps/api/src/modules/rides` (to compute the suggestion at creation time) and `apps/api/src/modules/bookings` (to compute `contributionTotal` and, later, fee). The mobile app never computes a price — it only displays what the API returns and enforces the bounds returned alongside it, so the same rule can't drift out of sync between platforms.

## Edge cases

- **Route not yet computed** (OSRM down, haversine fallback in effect): fall back to a haversine-distance-only formula with a wider bound (larger min/max spread, since haversine underestimates real driving distance) — never block ride publishing on pricing computation.
- **Driver edits route after a price was suggested**: recompute and re-prompt; don't silently keep a stale suggestion.
- **Very short rides** (a few km): enforce a minimum absolute floor (e.g. a flat minimum contribution) alongside the multiplier-based `minContribution`, so the formula doesn't suggest an unrealistically small number for a short hop.
- **Seed-data routes** (existing hardcoded `routes` rows): treat as a migration task — backfill `pricing_configs`-derived bounds, don't leave two competing sources of truth for the same route.

## What this document deliberately does not decide

The exact `base_rate_per_km` value, whether/when to activate a platform fee, and whether pricing should ever vary by region are business decisions requiring real Tunisian market input, not engineering ones. This document defines the mechanism; `CLAUDE.md`'s Open Decisions section tracks the unresolved numbers.
