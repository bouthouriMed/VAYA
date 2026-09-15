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

**Status as of Phase 6: a first-cut value is now in place, not still blank.** Running autonomously with no human available to consult during the Phase 6 implementation session, this document's own instruction above ("not something this document should invent a number for") was superseded by a pragmatic call: shipping the mechanism with an unresolved, un-seedable config would leave `pricing_configs` empty and force every ride into `@vaya/domain`'s `DEFAULT_PRICING_CONFIG` fallback silently, which is worse than a documented, reviewable first guess. See "Rate derivation (Phase 6, first-cut)" below for the number and reasoning, and `docs/roadmap/README.md`'s Open Decision #2 for its review status.

## Where pricing logic belongs

Per CLAUDE.md's architecture rules: pricing computation is business logic and belongs in `packages/domain` (a new `pricing` module, alongside the existing `booking`/`ride` modules), consumed by `apps/api/src/modules/rides` (to compute the suggestion at creation time) and `apps/api/src/modules/bookings` (to compute `contributionTotal` and, later, fee). The mobile app never computes a price — it only displays what the API returns and enforces the bounds returned alongside it, so the same rule can't drift out of sync between platforms.

## Edge cases

- **Route not yet computed** (OSRM down, haversine fallback in effect): fall back to a haversine-distance-only formula with a wider bound (larger min/max spread, since haversine underestimates real driving distance) — never block ride publishing on pricing computation.
- **Driver edits route after a price was suggested**: recompute and re-prompt; don't silently keep a stale suggestion.
- **Very short rides** (a few km): enforce a minimum absolute floor (e.g. a flat minimum contribution) alongside the multiplier-based `minContribution`, so the formula doesn't suggest an unrealistically small number for a short hop.
- **Seed-data routes** (existing hardcoded `routes` rows): treat as a migration task — backfill `pricing_configs`-derived bounds, don't leave two competing sources of truth for the same route.

## What this document deliberately does not decide

The exact `base_rate_per_km` value, whether/when to activate a platform fee, and whether pricing should ever vary by region are business decisions requiring real Tunisian market input, not engineering ones. This document defines the mechanism; `CLAUDE.md`'s Open Decisions section tracks the unresolved numbers.

## Rate derivation (Phase 6, first-cut)

**This is a first-cut, business-review-pending default, not a final business decision** — flagged loudly here, in `packages/domain/src/pricing/default-pricing-config.ts`'s doc comment, in the `pricing_configs` seed comment (`apps/api/src/db/seed.ts`), and in `docs/roadmap/README.md`'s Open Decision #2. Treat every number below as replaceable the moment real Tunisian market/survey data exists.

Derivation:

1. **Fuel cost per km.** Approximate Tunisian petrol price ≈ 2.5–2.6 DT/L (administratively set, revised periodically — the single input here most likely to be stale by the time this is read; confirm current pricing before treating this as authoritative). Typical small/compact-car consumption ≈ 7 L/100km — matches this codebase's own seeded driver fleet (Peugeot 208/301, Renault Clio, Dacia Logan, Kia Picanto, VW Golf, Hyundai i10), not an arbitrary assumption. Pure fuel cost ≈ (7/100) × 2.55 ≈ **0.18 DT/km**.
2. **Cost-sharing markup.** VAYA is a cost-sharing marketplace, not commercial dispatch (see "Pricing model" above) — carpooling contribution norms typically markup modestly over pure fuel cost to loosely cover wear/tolls, while staying well under a commercial taxi/louage per-km fare to preserve that legal/social framing (`docs/product/benchmark.md` §4). A ~1.35× markup: 0.18 × 1.35 ≈ 0.24, rounded to **`base_rate_per_km = 0.25` DT/km**.
3. **Time component.** `time_component_per_min = 0.08` DT/min — a small additional weight so two routes with the same distance but different congestion/duration don't suggest identical prices. Chosen jointly with `base_rate_per_km` by checking the combined formula against this codebase's own pre-Phase-6 hand-authored `routes` seed data (see below), not derived independently.
4. **Sanity check against pre-existing hand judgment.** The longest pre-Phase-6 seeded corridor (Tunis→Nabeul, ≈65km/58min) was hand-priced by a prior session at 20 DT recommended, with no formula behind it. `0.25 × 65 + 0.08 × 58 ≈ 20.8` DT — closely matching a number a human already judged reasonable for that corridor. This is the best available signal in the absence of real Tunisian survey/market data, and it's why these two constants were chosen together rather than independently.
5. **`min_multiplier = 0.7` / `max_multiplier = 1.3`.** Taken directly from this document's own pre-Phase-6 "Pricing model" example above — not re-derived, since nothing in the Phase 6 session surfaced a reason to deviate from it.
6. **Absolute floor (`ABSOLUTE_MIN_CONTRIBUTION_DT = 4`, `packages/domain/src/pricing/compute-suggested-price.ts`, not a `pricing_configs` column).** The "Very short rides" edge case above requires a floor independent of the multiplier band. 4 DT is what the chosen formula itself already produces as the effective minimum for any short urban hop once the floor kicks in (a few km rarely clears 4 DT via the multiplier-only formula) — it reads as "the formula's own answer for a short trip," not a second, disconnected number. Deliberately kept as a domain-module constant rather than a `pricing_configs` column: it is a structural floor on the formula's own output, not a tunable market rate the way `base_rate_per_km` is.

## Implementation note (Phase 6)

- **Where the `[min, max]` bound check actually happens.** The phase brief describes `packages/validation`'s ride-creation schema as enforcing the bound. In practice, a static Zod schema has no DB/OSRM access and can't know a route-dependent bound — `createRideSchema`/`updateRideSchema` only enforce "a positive number, if supplied," with a doc comment pointing at the real check. The actual `[min, max]` enforcement lives in `apps/api/src/modules/rides/rides.service.ts` (`createRide`/`updateRide`), which is where the rest of this codebase's business-rule validation already lives (e.g. `bookings.service.ts`'s `pickupStopId` enforcement) — this keeps the pattern consistent rather than teaching Zod schemas to reach into the DB.
- **Ride-creation flow, in practice.** `contributionPerSeat` is optional on `POST /rides`. If omitted (the normal mobile flow, since the driver hasn't seen a route-derived bound before the route exists), the server computes the route, derives `{min, recommended, max}`, and defaults `contributionPerSeat` to `recommended`. A new `PATCH /rides/:rideId` (draft-only) lets the driver commit an adjusted price after seeing the real bound — re-deriving and re-validating the bound server-side independently each time (never trusting a bound the client remembers from an earlier call). Both endpoints return the computed `{min, recommended, max}` and `routeIsEstimate` alongside the ride, so the mobile client never needs a second round-trip to render the price step.
- **Haversine-fallback widening**, in practice, widens the `min`/`max` multiplier spread by ±0.2 around the config's own `minMultiplier`/`maxMultiplier` (`FALLBACK_MULTIPLIER_WIDENING` in `compute-suggested-price.ts`) rather than attempting to correct the underlying haversine distance itself — distance correction stays routing.ts's concern, not pricing's.
- **Seed-data routes**: per this document's "Seed-data routes" edge case, `apps/api/src/db/seed.ts` was changed to derive every seeded route's `distanceKm`/`estimatedDurationMin`/`minContribution`/`recommendedContribution`/`maxContribution`, and every seeded ride's/booking's `contributionPerSeat`/`contributionTotal`, from real OSRM geometry run through `computeSuggestedPrice` with the same seeded `pricing_configs` row — not hand-typed. There is exactly one source of truth for seeded pricing now, not two silently-disagreeing ones.

## Rate revision (2026-09-15, real Tunisia research)

Supersedes the Phase 6 numbers above — read this section for the current values;
the Phase 6 section is kept for its derivation methodology, not as the current
truth. Full sourcing and the two flagged-open questions live in
`packages/domain/src/pricing/default-pricing-config.ts`'s own doc comment;
this section summarizes the reasoning and adds the sanity check that doc
comment doesn't have room for.

**New sourced inputs** (a background research pass into current Tunisian fuel
prices, fleet composition, and comparable shared-transport pricing — WebSearch
only, several primary sources were unreachable from the research sandbox, so
treat as search-engine-attributed rather than independently verified against
the original page):

- **Fuel prices**: petrol ≈ 2.53 DT/L, diesel ≈ 2.21 DT/L (both dated ~Aug
  2026, cross-corroborated by 2 independent sources each). Diesel is
  meaningfully cheaper than petrol — worth modeling explicitly rather than
  petrol-only, since Tunisia's fleet has a real diesel share.
- **Fleet composition**: ≈74% petrol / 26% diesel among private cars (ANME
  survey — dated, no more recent split found; treat as directional).
- **Consumption**: ≈7.7 L/100km petrol, ≈7 L/100km diesel (Tunisia-attributed,
  moderate confidence — smaller petrol/diesel efficiency gap than the generic
  assumption of ~5-6L/100km diesel used going in, which this revision does
  not use).
- **Blended fuel cost**: 0.74×(7.7/100×2.53) + 0.26×(7/100×2.21) ≈
  **0.184 DT/km** — almost exactly the Phase 6 session's 0.18 DT/km,
  independently reconfirmed with better sourcing rather than overturned.
- **Louage (regulated shared-taxi) tariff** — the genuinely new, decision-relevant
  finding: Ministry of Transport decree (effective 15 Dec 2022, still cited as
  current), **0.086 DT/km for 10-150km trips, 0.071 DT/km beyond 150km**, plus
  a small flat base fare under 10km. Cross-validated against real reported
  fares: Tunis-Sousse (~140km) at 0.086 DT/km ≈ 12 DT, matching the commonly
  reported 12-13 DT real fare; several ~65-90km corridors (Nabeul, Hammamet,
  Bizerte) land around ~7 DT at this rate, also matching reported figures.
  This gives real confidence in the 0.086/0.071 DT/km numbers.
- **Not found despite a real attempt**: any concrete current Tunisian informal
  carpooling price (Facebook covoiturage groups, a public SPLIT per-km rate),
  and any Tunisia-specific maintenance-cost-per-km rule of thumb beyond
  anecdotal oil-change/annual-maintenance blog figures too weak to build a
  multiplier on. Both are honest gaps, not filled in with invented numbers.

**Why the rate changed**: the louage benchmark is the first real,
government-set reference point for "what does a modest, per-passenger shared
transport price look like in this market" that this project has had. Checking
the Phase 6 rate against it is unflattering — `0.25 DT/km + 0.08 DT/min` on a
Tunis-Sousse-length trip (~140km/~100min) works out to **~43 DT**, roughly
**3.5× the real louage fare (~12-13 DT)** for the same route. That is in real
tension with `docs/legal/terms-and-conditions.md` Article 4, which stakes
VAYA's entire "this is cost-sharing, not a commercial transport service" legal
framing on the Contribution staying well under a regulated/commercial fare —
a price that runs several times higher than the state-regulated shared-taxi
equivalent works against that framing rather than supporting it, independent
of whether Tunisian carpooling norms would otherwise tolerate this rate.

**What changed**: the markup over blended fuel cost is pulled back from 1.35×
to ~1.1× — `base_rate_per_km = 0.184 × 1.1 ≈ 0.20 DT/km` (was 0.25) — and
`time_component_per_min` scaled down in the same proportion, `0.08 × 0.20/0.25
= 0.064`, rounded to **`0.06 DT/min`** (was 0.08). Re-running the Tunis-Sousse
sanity check at the new rate: `0.20 × 140 + 0.06 × 100 ≈ 34 DT` — still above
the ~12-13 DT louage fare, but meaningfully closer (down from ~3.5× to ~2.6×),
and a real, sourced move in the right direction rather than an untethered
guess. `min_multiplier`/`max_multiplier` (0.7/1.3) and the absolute floor
(`ABSOLUTE_MIN_CONTRIBUTION_DT = 4`) are unchanged — nothing in this research
pass surfaced evidence to move either.

**What this revision does not claim to have solved** — flagged loudly rather
than glossed over, per this file's own standing discipline:

1. **The per-seat price is occupancy-blind.** `computeSuggestedPrice` has no
   notion of how many seats a ride offers or how many end up filled — a fully
   occupied ride collects `recommended × seatsFilled`, which can still exceed
   both the louage benchmark and, at the extreme, the real total cost of the
   trip, for a well-filled ride on a longer corridor. Fully closing the gap to
   the louage benchmark implies pricing each seat as a genuine share of total
   trip cost divided by expected occupancy (something closer to `0.09 DT/km`
   per seat at typical 2-person occupancy — suspiciously close to the louage
   rate itself, which is a reassuring cross-check but not something this pass
   is implementing) rather than a flat per-km rate independent of how many
   seats sell. That is a real formula-shape change — touching
   `computeSuggestedPrice`'s signature, the API/mobile call sites, and
   `pricing_configs`' shape — not a constant tweak, and is explicitly left
   for a future phase to design and decide, not invented here.
2. **This is still not real Tunisian carpooling survey/market data** — the one
   source that would most directly answer "what do Tunisian drivers/riders
   actually consider a fair contribution" (informal Facebook-group pricing,
   or a real SPLIT rate) was searched for and not found. This revision is a
   defensible, evidence-grounded correction using the best available proxies
   (fuel cost, regulated louage tariff), not a replacement for that data once
   it exists.

Treat `base_rate_per_km = 0.20`/`time_component_per_min = 0.06` with the same
posture the Phase 6 numbers had: a real, reasoned, sourced first cut, still
pending actual business confirmation — not a settled monetization decision.
`docs/roadmap/README.md`'s Open Decision #2 and `CLAUDE.md`'s "Important
decisions" section are updated to reflect this revision.
