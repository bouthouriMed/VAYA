# Ride Engine: Route → Candidate Stops → Validation → Ranking → Selection

## Why this exists

Today, a driver's ride is a single origin point and a single destination point (`rides.originLat/Lng`, `destinationLat/Lng`). A passenger's pickup point is a free-standing coordinate (`bookings.pickupLat/Lng`) chosen on a screen that is an explicit, non-geospatial fake (`search/pickup-point.tsx`, `PX_PER_DEGREE = 9000` — `docs/product/audit.md` §4). Neither side is ever told whether a point is actually reachable, safe to stop at, or on the route. This document defines the system that replaces both.

**Core principle, restated from the task brief:** a passenger must never be offered a geographically convenient point that is practically impossible or unsafe for a driver to reach. The system proposes a small, validated, ranked set of stops — it never lets either side place an arbitrary pin.

## What already exists and must be reused, not rebuilt

- **Real road routing**: self-hosted OSRM with a Tunisia extract (`docker-compose.yml`), wrapped by `lib/routing.ts` (`getRoute`), already used by `rides.service.ts` to compute `routePolyline`/`estimatedDurationSec`, with a documented haversine fallback if OSRM is unavailable.
- **Real route-overlap scoring**: `lib/polyline.ts`'s `computeRouteOverlapFraction` already does corridor-based geometry comparison (150m corridor width, `OVERLAP_CORRIDOR_WIDTH_M` in `matching.service.ts`) between a rider's requested route and a candidate ride's actual road path. This is the geometric primitive the stop-candidate system builds on.
- **Real matching algorithm**: `matching.service.ts`'s `scoreCandidates` (tight/wide radius, time-window scoring, walk-minutes estimate, reasons list) is a genuinely strong ranking system — extend it to be stop-aware, don't replace it.
- **Caching layer**: `lib/cache.ts`/`lib/redis.ts`, already used to cache OSRM/geocoding calls — candidate-stop generation should be cached the same way (keyed by route, not regenerated per search).

## Architecture

```
Driver confirms route (origin → destination)
        │
        ▼
  Route-selection step                      (NEW: route-options.service.ts)
    - real route alternatives via the active RoutingProvider (fastest,
      toll-avoiding, highway-avoiding, algorithmic alternates)
    - driver picks one; skipped entirely when there's only one real option
        │
        ▼
  OSRM/Google computes real polyline + duration for the picked route
  (existing: lib/routing.ts, now redeemed via a route-selection token)
        │
        ▼
  Candidate stop generation                 (stop-candidates.service.ts)
    - sample points along the polyline at an interval
    - snap each sample to real road network + nearby POIs
    - score each for stop-suitability
    - deduplicate/cluster nearby candidates
        │
        ▼
  Driver selects which candidate stops to actually serve
  (a subset of the generated candidates — driver has final say)
        │
        ▼
  route_stops rows created for this ride
        │
        ▼
  Passenger search / matching                (extend: matching.service.ts)
    - rank the ride's route_stops by proximity to passenger's actual origin
    - only offer stops within a walkable/reasonable radius
        │
        ▼
  Passenger selects one ranked stop as pickupStopId on their booking
```

## Route-selection step

Before candidate-stop generation, the driver picks which real road their ride actually takes — the two hardest carpooling mechanics this document opens with ("where to stop, what to pay") both implicitly assumed a single, already-decided route; this step makes the route itself a small, validated, ranked choice too, consistent with product principle #1.

- **`RoutingProvider.computeRouteAlternatives`** (`lib/routing-providers/`): each provider adapter returns a small set of genuinely distinct `RouteAlternative`s, not just whatever a raw "alternatives" flag happens to surface.
  - **Google Routes**: fires the default request with `computeAlternativeRoutes: true` (fastest + up to 2 algorithmic alternates, with toll info) in parallel with an explicit `avoidTolls` request and an explicit `avoidHighways` request — each modifier result is only kept if its geometry actually differs from every option already collected, so a route with no tolls to begin with doesn't produce a duplicate "avoid tolls" card.
  - **OSRM**: `alternatives=true` on `/route` — real geometric alternates, honestly labeled `fastest`/`alternative` only (no modifier vocabulary exists in this deployment's profile, so `no_tolls`/`no_highways` are never fabricated for the OSRM path — `hasTolls` is always `null`, never guessed as `false`).
- **`route-options.service.ts`**: `getRouteOptions(origin, destination)` is stateless (no ride needs to exist yet) and mints a short-lived (15 min), one-shot Redis token per option. `redeemRouteToken` is what `createRide` calls: a token is only valid for the exact origin/destination it was minted for, and is deleted the moment it's redeemed — the mechanism that keeps `createRide`'s pricing server-authoritative (CLAUDE.md: bounds must be enforced server-side, independent of client input) even though the client is choosing which route to use. A missing/expired/mismatched token degrades to the default route computation exactly as before this step existed — never blocks ride creation.
- **Mobile** (`apps/mobile/app/(tabs)/publish.tsx`): a new `'route'` wizard step between the origin/destination form and pickup/dropoff selection, shown only when there are 2+ genuinely distinct options — a route with a single real answer skips the step entirely (the "without friction" principle this wizard already applies to zero-stop publishing). All alternatives are drawn on one persistent map at once (Google/Waze route-picker convention: unselected routes muted, the selected one solid + on top), with a `RouteOptionCard` list underneath; picking a card just re-highlights the map, no re-fetch.
- `rides.routeKind` (migration `0016_add_ride_route_kind.sql`, additive/nullable) records which kind of route the driver picked, for future stop-generation tuning and analytics — never backfilled, `null` just means "picked before this feature existed."

## Candidate stop generation — algorithm

1. **Sample the route.** Walk `rides.routePolyline` (already decoded via `decodePolyline` in `lib/polyline.ts`) and sample candidate points at a fixed interval (proposed: every ~800m–1.2km, denser in urban segments, sparser on open highway — the interval itself should be a `pricing_configs`-style tunable, not hardcoded).

   **Implementation note (route-selection + trip-profile tuning):** implemented as `classifyTripProfile` (`packages/domain/src/route/classify-trip-profile.ts`), a pure function that buckets a route by its real `distanceM` into `commute` (≤15km: 500m interval, up to 5 candidates, 120m merge radius), `urban` (≤45km: the original 1km/8/150m defaults, unchanged), or `intercity` (>45km: 2.5km interval, up to 12 candidates, 300m merge radius — wider spacing since a driver won't detour every km on a highway leg, but more total candidates since the route passes through more distinct towns). `stop-candidates.service.ts`'s `computeCandidatesForRoute` derives the profile from the route it's actually generating candidates for and threads it through `sampleRoutePoints`/`clusterAndRank` instead of the fixed constants — a `pricing_configs`-style DB-backed tunable would be the natural next step once real driver usage data justifies it (same "don't over-configure ahead of evidence" principle CLAUDE.md's architecture section states for pricing).
2. **Snap to reachable road geometry.** Use OSRM's `nearest` service (already have an OSRM client in `lib/routing.ts` — extend it with a `nearestRoad` call) to snap each sampled point to the nearest drivable road segment. Discard samples that can't snap within a small tolerance (e.g. water, pedestrian-only areas).
3. **Score stop-suitability.** Each snapped candidate gets a suitability score from signals available without new data acquisition in phase 1:
   - **Route deviation**: distance/time cost for the driver to detour from the straight route line to this stop and back — must stay under a configurable max deviation (e.g. 300m / 2 minutes). Reject candidates above the threshold outright, don't just downrank them.
   - **Road class**: prefer secondary/tertiary roads and named streets over motorways/highways (unsafe to stop) or unnamed tracks (unreliable). Reject motorway-class matches outright — a driver should never be asked to stop on a highway shoulder. **Implementation note (Phase 4):** the original plan here was to read way metadata straight off OSRM's `nearest` response. Verified against the live docker-composed OSRM instance (Tunisia extract, default `car.lua` profile) that neither `/nearest` nor `/route` expose a `classes`/way-class tag in this deployment — there is no such field to read. Implemented instead: local travel speed from `/route`'s `annotations=true` output (real per-segment data OSRM does expose) as the classification signal — sustained speed ≥ ~90 km/h is treated as motorway-grade and rejected. This was verified against a real Tunis→Hammamet route crossing the A1: 2 of 68 sampled points were correctly classified motorway and rejected before scoring. See `apps/api/src/modules/rides/stop-candidates.service.ts`'s `classifyRoadSpeed`.
   - **Proximity to a labeled place** (reverse-geocode via the existing `geocoding` module): a candidate near a named landmark, station, or commercial area outranks a candidate in the geometric middle of nowhere, because passengers need to describe/find it.
   - **Clustering**: candidates within ~150m of each other (reusing `OVERLAP_CORRIDOR_WIDTH_M`'s corridor-distance logic) are merged into one, keeping the highest-scored.
4. **Cap the candidate count.** Return the top N (proposed N=6-10) scored candidates per route to the driver, not every sample point — this is a selection UI, not a data dump.
5. **Cache by route geometry.** Since generation depends only on the OSRM polyline (not on driver/time), cache keyed by a hash of the polyline so republishing a similar route doesn't recompute from scratch.

### Explicit v1 limitation, stated honestly

Road-class metadata from OSRM's base extract does not encode real-world "is there physically space to pull over here" (parking, curb cutouts, informal taxi/louage stopping habits). A v1 launch should treat the suitability score as a strong prior, not ground truth, and let drivers reject/skip any generated candidate freely. A future iteration can incorporate driver-confirmed stop quality (a stop used successfully many times gets a reliability boost) — this is a natural extension of the existing `relationship_signals`/reliability-scoring pattern already in the domain model, not a new mechanism.

## Passenger-side stop ranking

Reuses `matching.service.ts`'s existing scoring shape rather than inventing a parallel system:

- For a candidate ride, rank its `route_stops` (`is_driver_selected = true`) by walk-distance from the passenger's actual requested origin (same `haversineDistanceMeters` + `WALK_SPEED_M_PER_MIN` pattern already used for `pickupWalkMinutes`) — the pure function is `rankStopsByWalkDistance` in `matching.service.ts`.
- Only surface stops within a walkable radius: filtered against `WIDE_PICKUP_RADIUS_M` (the wider of the two existing tiers — a further, stop-specific cutoff on top of whichever ride-level tight/wide search found the ride in the first place), not new radius numbers.
- If no stop on a matched ride is close enough, that's a legitimate "doesn't reach you conveniently" result — surface it honestly (`docs/ux/passenger-journey.md` §4), don't force a bad match.

### Implementation note (Phase 5): the "zero viable stops" decision

The design above leaves "surface it honestly" underspecified — the actual choice is between excluding a non-viable ride from `matching.service.ts`'s results outright, or including it flagged as non-bookable. **Implemented: include, flagged.** Every `MatchCandidate` carries a `pickupViable: boolean` alongside its `rankedStops` array — `false` only when the ride has at least one driver-selected `route_stop` but none rank within `WIDE_PICKUP_RADIUS_M` of the passenger's origin (`isPickupViable` in `matching.service.ts`); always `true` for a legacy ride with zero `route_stops` at all, which keeps using the free-form pickup flow.

Why include-and-flag over silent exclusion: excluding server-side would make the `pickup_no_viable_stop` analytics event (this phase's own signal for whether Phase 4's candidate density needs tuning — see that phase's Risks section) unobservable from the client without standing up a second, server-side analytics path, which CLAUDE.md's architecture principles explicitly discourage until a second real use case justifies it. Keeping the flag in the API response lets the existing thin mobile `trackEvent` hook (`apps/mobile/src/services/analytics/analytics.ts`) fire the event with real data, while the mobile client (`search/cluster.tsx`) still never renders or lets a passenger tap into a `pickupViable: false` result — so the "never offer a fabricated/impossible pickup option" guarantee (product principle #1/#4) holds at the UI layer even though the ride isn't dropped from the wire response.

## Database model — `route_stops`

```
route_stops
  id                  uuid PK
  ride_id             uuid FK → rides, cascade
  sequence            integer            -- order along the route, origin=0
  label               varchar(140)       -- human-readable ("Station Total, Av. Habib Bourguiba")
  lat, lng             double precision
  road_snapped        boolean            -- did OSRM nearest-snap succeed
  deviation_meters     integer            -- driver detour cost to serve this stop
  deviation_seconds    integer
  suitability_score    double precision   -- 0-1, from the scoring above
  road_class           varchar(30)        -- from OSRM way metadata
  is_driver_selected   boolean default false  -- driver opted into offering this stop
  created_at, updated_at
```

Indexes: `(ride_id)`, `(ride_id, is_driver_selected)` for the passenger-facing query.

`bookings` gains a nullable `pickup_stop_id FK → route_stops`. Keep `pickupLabel/Lat/Lng` columns for rides published before this system ships (backward compatibility, not a design endorsement — see rollout note below) and populate them by copying from the selected stop at booking time, so existing consumers (trip-day screens, notifications payloads) don't need to branch on schema version.

**Implementation note (Phase 5):** shipped as migration `0004_common_bill_hollister.sql`, additive only. `pickup_stop_id` uses `ON DELETE SET NULL` rather than cascade — `generateCandidateStopsForRide`'s regeneration path (above) deletes and reinserts `route_stops` rows when a ride's route changes, and a booking must never be destroyed by that; `pickupLabel/Lat/Lng` were already copied at booking time, so losing the FK link loses no data. Enforcement lives in `bookings.service.ts`'s `createBooking`: for any ride with at least one `is_driver_selected = true` stop, `pickupStopId` is required and must reference one of that ride's own selected stops (400 otherwise); free-form `pickupLat/Lng` is rejected outright for such rides (400); a ride with zero `route_stops` at all keeps accepting the legacy free-form `pickup` object unchanged.

## API surface (new)

- `POST /rides/:id/candidate-stops` — triggers generation (called after route is computed during ride creation, before publish). Returns the ranked candidate list. Idempotent given the same route.
- `PATCH /rides/:id/stops` — driver's final selection of which candidates to actually offer (`is_driver_selected`).
- `GET /rides/:id/stops` — used by the passenger-matching path to fetch a ride's active stops (`is_driver_selected = true` only); an authenticated `?all=true` variant returns every generated candidate for the owning driver's own editing view.
- `POST /rides/:id/publish` — **implementation note (Phase 4):** ride creation now inserts as `draft` rather than immediately `published` (the `draft` status already existed in `packages/domain`'s ride state machine but was previously unused — `createRide` skipped straight to `published`), specifically so a ride id and computed `routePolyline` exist for candidate-stop generation before the driver's final publish action. This new endpoint reuses the existing `canTransitionRideStatus` transition check to move `draft → published`; mobile's `driver/publish.tsx` calls create → generate-stops → (select) → this endpoint as one continuous flow, so the two-step nature is invisible to the driver.
- `matching.service.ts`'s response shape gains a `rankedStops` array (and a `pickupViable` flag — see the Phase 5 implementation note above) per candidate ride, alongside the existing `pickupWalkMinutes` field (kept for legacy/ride-level relevance, not replaced).

## Validation & edge cases

- **No viable candidates found** (e.g. a very short ride, or a route through an area with poor OSRM coverage): fall back to offering origin and destination themselves as the only two stops, rather than blocking publish. Log this case — it's a signal the sampling interval or scoring thresholds need tuning for that area.
- **Driver deselects all candidates**: not allowed — require at least one stop beyond origin/destination is unnecessary; origin/destination alone is a valid minimal ride. Don't force stop adoption.
- **Route changes after stops are generated** (driver edits the ride before publishing): invalidate and regenerate; never let stale stops from a different route persist. **Implementation note (Phase 4):** the `route_stops` schema above has no `source_polyline_hash` column, so "which route these stops were generated for" is tracked as a Redis key (`route-stops:ride-hash:{rideId}` → polyline hash) rather than a new schema column — a natural extension of the same "cache candidate generation" role Redis already serves here, not a second mechanism. A regeneration call whose stored hash matches the ride's current `routePolyline` is a no-op read (the idempotency the API section above requires); a mismatch deletes stale rows and regenerates. If Redis isn't configured, generation simply always re-runs (correctness-safe, just without the fast path).
- **OSRM unavailable**: `lib/routing.ts` already falls back to haversine for point-to-point routing; candidate generation has no equivalent (a straight line has no road geometry to snap to). In this case, skip stop generation entirely and fall back to origin/destination-only, surfaced honestly to the driver ("detailed stop suggestions unavailable right now"), rather than fabricating candidates from the haversine line.
- **Passenger requests a stop outside the driver's selected set**: not possible by construction — the booking UI only ever offers `is_driver_selected = true` stops. This is the mechanism that guarantees the "never geographically convenient but practically impossible" failure mode can't occur.

## Rollout

This is additive to the existing `rides`/`bookings` tables, not a breaking migration. Shipped in two phases (see `docs/roadmap`): first the driver-side candidate generation + selection (Phase 4: Ride Engine I), then the passenger-side ranked selection replacing the fake `pickup-point.tsx` (Phase 5: Ride Engine II, shipped). Rides published between the two phases still work with the old single-pickup flow — no hard cutover was forced: `search/cluster.tsx` routes a passenger through the new stop-selection screen only when the matched ride actually has `rankedStops`, and falls straight through to the booking screen (free-form pickup, as before) for any ride with zero `route_stops`.
