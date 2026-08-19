# Phase 4 — Ride Engine I: Driver Route → Candidate Stops

**Horizon:** NOW · **Estimated complexity:** High

## Objective

Give drivers a route-aware set of suggested stops instead of a single origin/destination pair, per the full design in `docs/domain/ride-engine.md`. This is the first of two phases implementing the ride engine — this one is entirely driver-side (generation + selection); Phase 5 adds the passenger-side selection and matching integration.

## Prerequisites

Phase 1 (booking integrity), Phase 3 (real map rendering — stop selection needs a real map to place candidates on).

## Exact scope

1. New `route_stops` table (full schema in `docs/domain/ride-engine.md`).
2. New backend service `apps/api/src/modules/rides/stop-candidates.service.ts`: given a ride's `routePolyline`, sample points, snap to road network via OSRM's `nearest` endpoint (extend `lib/routing.ts`), score for suitability (deviation, road class, landmark proximity via existing `geocoding` module), cluster/dedupe, return top N.
3. New endpoints: `POST /rides/:id/candidate-stops` (generate), `PATCH /rides/:id/stops` (driver's final selection), `GET /rides/:id/stops`.
4. Mobile: extend `driver/publish.tsx` flow with a new step between route confirmation and seats/price — a stop-selection screen using the new BottomSheet (Phase 2) and real map (Phase 3), showing candidate stops as markers the driver taps to include/exclude.
5. Caching: candidate generation cached by route-polyline hash in Redis (`lib/cache.ts`), per `docs/domain/ride-engine.md`.

## User flows

Driver flow (extends `docs/ux/driver-journey.md` §1): origin/destination entry (unchanged) → route computed (unchanged) → **new: candidate stops generated and shown on the map; driver taps to select which to offer** → seats/price (unchanged shell, price logic changes in Phase 6) → publish.

## Screens

New: a stop-selection step in the `driver/publish.tsx` flow (either a new route file `driver/publish-stops.tsx` or a step within the existing multi-step screen — match whatever step pattern `publish.tsx` already uses). No other screens change in this phase.

## UX behavior

- Loading: skeleton/spinner while candidates generate (should be fast — cached by route hash — but first-time generation for a novel route calls OSRM's `nearest` N times, budget for a brief wait with a clear loading state).
- Empty: if no viable candidates are found (short ride, poor OSRM coverage), fall back gracefully to origin/destination-only per `docs/domain/ride-engine.md`'s edge case, with an honest message, not a dead end.
- Selection: tapping a candidate marker toggles it via the BottomSheet detail view (label, road class, deviation cost shown); selected stops are visually distinct (filled vs. outline marker, using `DriverMapPin`'s existing compact/full variants).
- Minimum: driver may publish with zero additional stops (origin/destination alone remains valid) — never force stop adoption.

## Design-system work

Reuses Phase 2/3 output (BottomSheet, real map, DriverMapPin). No new primitives required if those phases shipped first — if a stop-detail card pattern doesn't already fit an existing primitive, it's a small addition to `FieldCard`/`Card`, not a new component class.

## Frontend

`apps/mobile/app/driver/publish.tsx` (extended), new stop-selection step component, `apps/mobile/src/state` (extend `driverOnboardingSlice` or a new `rideCreationSlice` — check existing slice boundaries before deciding, per the "no God-slice" discipline noted in the audit).

## Backend

`apps/api/src/modules/rides/stop-candidates.service.ts` (new), `apps/api/src/modules/rides/rides.controller.ts` (new routes), `apps/api/src/lib/routing.ts` (extend with OSRM `nearest` call), `packages/validation/src` (new schemas for the candidate-stop endpoints).

## Database

Migration adding `route_stops` (full schema in `docs/domain/ride-engine.md`), with indexes on `(ride_id)` and `(ride_id, is_driver_selected)`.

## API

- `POST /rides/:id/candidate-stops` — idempotent given the same route; returns ranked candidates with `suitabilityScore`, `deviationMeters/Seconds`, `roadClass`, `label`.
- `PATCH /rides/:id/stops` — body: array of `{stopId, isDriverSelected}`.
- `GET /rides/:id/stops` — returns only `is_driver_selected = true` stops (public/passenger-facing shape); an internal variant or query param can return all candidates for the driver's own editing view.

## Business rules

- A candidate exceeding the max route-deviation threshold (proposed: 300m / 2 min) is rejected outright, never just downranked — per `docs/domain/ride-engine.md`.
- Motorway/highway-class road matches are rejected outright (unsafe stopping).
- Candidates within ~150m of each other are merged (reuse the existing `OVERLAP_CORRIDOR_WIDTH_M` corridor-distance constant from `matching.service.ts` rather than introducing a second magic number for functionally the same concept).
- Route changes after generation invalidate and require regeneration before publish.

## Testing

- Unit tests for the scoring function (deviation calculation, road-class rejection, clustering) with fixed synthetic route/candidate inputs — this is pure, testable logic and should not require a live OSRM instance to test the scoring math itself (mock the OSRM `nearest` response).
- Integration test against a real (or docker-composed) OSRM instance for at least one real Tunisian route, confirming end-to-end candidate generation produces a sane result.
- Mobile test for the stop-selection UI toggling `isDriverSelected` state correctly.

## Analytics

- `ride_stop_candidates_generated` (count, route hash, generation latency).
- `ride_stop_selected` / `ride_stop_deselected` (per candidate, to eventually learn which generated candidates drivers actually trust — feeds the "driver-confirmed stop quality" future iteration noted in `docs/domain/ride-engine.md`).
- `ride_published_with_zero_stops` (signal for whether the feature is being adopted).

## Definition of Done

- [ ] `route_stops` table exists via migration.
- [ ] Candidate generation produces sane, real-road-snapped results for at least 3 manually verified real Tunisian routes (spanning urban and intercity).
- [ ] Driver can select/deselect candidates in the mobile app and publish successfully with a non-empty stop set.
- [ ] All rejection rules (deviation threshold, motorway exclusion) verified by unit test.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Dependencies

Hard blocker for Phase 5 (passenger-side stop selection has nothing to rank without driver-selected stops existing). Phase 6 (Pricing) can proceed in parallel or after — not blocked by this phase, but pricing suggestions are more accurate once route/stop data is finalized.

## Risks

The scoring heuristic (road class, deviation, landmark proximity) is the highest-uncertainty part of the whole roadmap — it's tuned on assumptions, not real Tunisian usage data yet. Expect to revisit the scoring weights after real driver usage, and build the analytics events above specifically to make that revision possible. Don't treat the first-cut weights as final.
