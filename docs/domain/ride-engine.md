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
Driver publishes route (origin → destination)
        │
        ▼
  OSRM computes real polyline + duration   (existing: lib/routing.ts)
        │
        ▼
  Candidate stop generation                 (NEW: stop-candidates.service.ts)
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

## Candidate stop generation — algorithm

1. **Sample the route.** Walk `rides.routePolyline` (already decoded via `decodePolyline` in `lib/polyline.ts`) and sample candidate points at a fixed interval (proposed: every ~800m–1.2km, denser in urban segments, sparser on open highway — the interval itself should be a `pricing_configs`-style tunable, not hardcoded).
2. **Snap to reachable road geometry.** Use OSRM's `nearest` service (already have an OSRM client in `lib/routing.ts` — extend it with a `nearestRoad` call) to snap each sampled point to the nearest drivable road segment. Discard samples that can't snap within a small tolerance (e.g. water, pedestrian-only areas).
3. **Score stop-suitability.** Each snapped candidate gets a suitability score from signals available without new data acquisition in phase 1:
   - **Route deviation**: distance/time cost for the driver to detour from the straight route line to this stop and back — must stay under a configurable max deviation (e.g. 300m / 2 minutes). Reject candidates above the threshold outright, don't just downrank them.
   - **Road class** (from OSRM's `nearest` response, which includes way metadata): prefer secondary/tertiary roads and named streets over motorways/highways (unsafe to stop) or unnamed tracks (unreliable). Reject motorway-class matches outright — a driver should never be asked to stop on a highway shoulder.
   - **Proximity to a labeled place** (reverse-geocode via the existing `geocoding` module): a candidate near a named landmark, station, or commercial area outranks a candidate in the geometric middle of nowhere, because passengers need to describe/find it.
   - **Clustering**: candidates within ~150m of each other (reusing `OVERLAP_CORRIDOR_WIDTH_M`'s corridor-distance logic) are merged into one, keeping the highest-scored.
4. **Cap the candidate count.** Return the top N (proposed N=6-10) scored candidates per route to the driver, not every sample point — this is a selection UI, not a data dump.
5. **Cache by route geometry.** Since generation depends only on the OSRM polyline (not on driver/time), cache keyed by a hash of the polyline so republishing a similar route doesn't recompute from scratch.

### Explicit v1 limitation, stated honestly

Road-class metadata from OSRM's base extract does not encode real-world "is there physically space to pull over here" (parking, curb cutouts, informal taxi/louage stopping habits). A v1 launch should treat the suitability score as a strong prior, not ground truth, and let drivers reject/skip any generated candidate freely. A future iteration can incorporate driver-confirmed stop quality (a stop used successfully many times gets a reliability boost) — this is a natural extension of the existing `relationship_signals`/reliability-scoring pattern already in the domain model, not a new mechanism.

## Passenger-side stop ranking

Reuses `matching.service.ts`'s existing scoring shape rather than inventing a parallel system:

- For a candidate ride, rank its `route_stops` by walk-distance from the passenger's actual requested origin (same `haversineDistanceMeters` + `WALK_SPEED_M_PER_MIN` pattern already used for `pickupWalkMinutes`).
- Only surface stops within a walkable radius (reuse `TIGHT_PICKUP_RADIUS_M`/`WIDE_PICKUP_RADIUS_M` tiers).
- If no stop on a matched ride is close enough, that's a legitimate "doesn't reach you conveniently" result — surface it honestly (`docs/ux/passenger-journey.md` §4), don't force a bad match.

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

## API surface (new)

- `POST /rides/:id/candidate-stops` — triggers generation (called after route is computed during ride creation, before publish). Returns the ranked candidate list. Idempotent given the same route.
- `PATCH /rides/:id/stops` — driver's final selection of which candidates to actually offer (`is_driver_selected`).
- `GET /rides/:id/stops` — used by the passenger-matching path to fetch a ride's active stops.
- `matching.service.ts`'s response shape gains a `rankedStops` array per candidate ride instead of (or alongside) the current single `pickupWalkMinutes` field.

## Validation & edge cases

- **No viable candidates found** (e.g. a very short ride, or a route through an area with poor OSRM coverage): fall back to offering origin and destination themselves as the only two stops, rather than blocking publish. Log this case — it's a signal the sampling interval or scoring thresholds need tuning for that area.
- **Driver deselects all candidates**: not allowed — require at least one stop beyond origin/destination is unnecessary; origin/destination alone is a valid minimal ride. Don't force stop adoption.
- **Route changes after stops are generated** (driver edits the ride before publishing): invalidate and regenerate; never let stale stops from a different route persist.
- **OSRM unavailable**: `lib/routing.ts` already falls back to haversine for point-to-point routing; candidate generation has no equivalent (a straight line has no road geometry to snap to). In this case, skip stop generation entirely and fall back to origin/destination-only, surfaced honestly to the driver ("detailed stop suggestions unavailable right now"), rather than fabricating candidates from the haversine line.
- **Passenger requests a stop outside the driver's selected set**: not possible by construction — the booking UI only ever offers `is_driver_selected = true` stops. This is the mechanism that guarantees the "never geographically convenient but practically impossible" failure mode can't occur.

## Rollout

This is additive to the existing `rides`/`bookings` tables, not a breaking migration. Ship in two phases (see `docs/roadmap`): first the driver-side candidate generation + selection (Phase: Ride Engine I), then the passenger-side ranked selection replacing the fake `pickup-point.tsx` (Phase: Ride Engine II). Rides published between the two phases should still work with the old single-pickup flow — don't force a hard cutover.
