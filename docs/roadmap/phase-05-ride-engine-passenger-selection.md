# Phase 5 — Ride Engine II: Passenger Stop Selection & Matching Integration

**Horizon:** NOW · **Estimated complexity:** High

## Objective

Replace the confirmed-fake `search/pickup-point.tsx` (`PX_PER_DEGREE = 9000`, non-geospatial) with real selection among a matched ride's driver-approved stops, and extend the matching algorithm to rank stops, not just rides. This is the phase that actually retires the single most misleading screen in the current app.

## Prerequisites

Phase 4 (rides must have `route_stops` to select from) and Phase 3 (real map for the selection UI).

## Exact scope

1. Extend `matching.service.ts`'s `scoreCandidates` to, for each matched ride, fetch its `route_stops` (`is_driver_selected = true`) and rank them by walk-distance from the passenger's requested origin — reusing the existing `haversineDistanceMeters`/`WALK_SPEED_M_PER_MIN` pattern already used for `pickupWalkMinutes`. Add a `rankedStops` array to the `MatchCandidate` response shape.
2. Filter: only surface stops within the existing tight/wide radius tiers (`TIGHT_PICKUP_RADIUS_M`/`WIDE_PICKUP_RADIUS_M`) — reuse the constants, don't fork new ones.
3. Rebuild `search/pickup-point.tsx` entirely: real map (Phase 3), shows the matched ride's ranked candidate stops as markers/list, passenger taps one to select. No free pin placement.
4. `bookings` gains `pickupStopId` (nullable FK) — `createBooking` now accepts a `stopId` instead of (or in addition to, for backward compatibility) raw `pickupLat/Lng`; server populates `pickupLabel/Lat/Lng` from the selected stop at booking time.
5. Handle the "no stop close enough" case explicitly: if a matched ride has zero stops within the passenger's walkable radius, show it as a legitimate non-viable result (or exclude it from results) rather than forcing a bad match — this is a product decision to make explicitly here, not an incidental edge case.

## User flows

Passenger flow (extends `docs/ux/passenger-journey.md` §4): search → results/cluster (unchanged) → select a ride → **new: pick from that ride's ranked candidate stops instead of dropping a pin** → trust/booking screen (unchanged) → confirm.

## Screens

`search/pickup-point.tsx` (full rebuild). `matching`-consuming screens (`results.tsx`, `cluster.tsx`) may need minor changes to pass through which ride was selected before entering the stop-selection screen, if not already structured that way.

## UX behavior

- Ranked list/map hybrid: closest/best stop pre-selected by default, others visible and tappable (map-first per `docs/ux/principles.md` #1) — avoid making the passenger scan a plain list when a map communicates "how close is this to me" more directly.
- If zero stops are within range: honest empty state (Phase 2's EmptyState) explaining why, with a path back to adjust search.
- Selecting a stop shows its label/landmark description clearly (this is exactly why `docs/domain/ride-engine.md`'s scoring favors landmark-proximate candidates — passengers need to recognize where they're going).

## Design-system work

Reuses Phase 2/3 primitives (real map, BottomSheet for stop detail, EmptyState for zero-match case). No new primitives expected.

## Frontend

`apps/mobile/app/search/pickup-point.tsx` (rewritten), `apps/mobile/src/state/searchSlice` (extend to carry selected stop through to booking), `apps/mobile/app/search/trust.tsx` (pass `pickupStopId` through to `createBooking`).

## Backend

`apps/api/src/modules/matching/matching.service.ts` (extend `scoreCandidates`/`MatchCandidate`), `apps/api/src/modules/bookings/bookings.service.ts` (accept `stopId`, populate pickup fields from it), `packages/validation/src` (update booking creation schema).

## Database

Migration adding `bookings.pickup_stop_id` (nullable FK → `route_stops`). No column removal — `pickupLabel/Lat/Lng` retained for backward compatibility with rides published before Phase 4 shipped (per the rollout note in `docs/domain/ride-engine.md`).

## API

`GET /matching/search` response gains `rankedStops` per candidate. `POST /bookings` accepts `stopId` (preferred) with `pickupLat/Lng` retained as a fallback path only for rides with no `route_stops` (pre-Phase-4 rides) — reject free-form pickup coordinates for any ride that does have stops, this is the enforcement mechanism that makes the "never offer an impossible point" guarantee real.

## Business rules

- A booking's `pickupStopId` must reference a stop belonging to the same `rideId` and must have `is_driver_selected = true` — validated server-side, not just trusted from the client.
- For rides with at least one `route_stop`, free-form `pickupLat/Lng` booking requests are rejected (400) — this is the hard enforcement of "no arbitrary coordinates," not just a UI nudge.
- For legacy rides with zero stops (published before this phase), the old free-form flow remains valid — don't break existing published rides.

## Testing

- Unit test for the stop-ranking extension to `scoreCandidates` (given fixed stops and a passenger origin, verify correct ranking/filtering).
- Unit test confirming the API rejects a `pickupStopId` belonging to a different ride, and rejects free-form coordinates for a ride that has stops.
- Mobile test for the rebuilt `pickup-point.tsx` rendering ranked stops and producing a correct `stopId` on selection.
- E2E test (`tests/e2e`) covering the full search → select ride → select stop → book flow — this is exactly the kind of core-loop flow the audit found `tests/e2e` currently has zero coverage of.

## Analytics

- `pickup_stop_selected` (which ranked position was chosen — first suggestion vs. scrolled further, useful for validating the ranking quality).
- `pickup_no_viable_stop` (ride excluded/flagged due to no stop in range — signal for whether Phase 4's candidate density needs tuning).

## Definition of Done

- [ ] `search/pickup-point.tsx` no longer contains any pixel-projection/fake-geospatial code; fully real-map-backed.
- [ ] Matching API returns ranked stops per candidate ride.
- [ ] Booking creation enforces stop-based pickup for any ride with stops; legacy free-form path still works for stop-less rides.
- [ ] E2E test covers the full search-to-booking flow with a real stop selection.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Dependencies

Nothing later strictly depends on this phase, but it's the direct payoff of Phase 4's investment — deferring it long after Phase 4 ships means drivers can select stops that nothing actually uses yet.

## Risks

The biggest risk is the "no viable stop" case turning out to be common in practice if Phase 4's candidate density is too sparse for a given corridor — watch the `pickup_no_viable_stop` analytics event closely after launch and be ready to tune Phase 4's sampling interval, not just accept a high dead-end rate.
