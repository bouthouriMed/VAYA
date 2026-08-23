# VAYA Search & Matching Engine — World-Class Audit

**Date:** 2026-08-23 · **Scope:** read-only audit, no code changes · **Author's role:** Principal Engineer / Geospatial Search Architect / Marketplace Matching review

This document traces the *actual* implementation (not names, comments, or intent) of VAYA's search/matching engine, compares it against publicly documented BlaBlaCar engineering concepts, and produces a gap analysis and prioritized roadmap. Every claim about VAYA cites an exact file/function. Claims about BlaBlaCar are restricted to publicly documented concepts (PostGIS-based gross matching → routing-API-based precise detour, Boost rides, materialized trip data, ML-based Smart Selection) — no claim of proprietary internals is made.

Labeling convention used throughout: **FACT** (verified by reading code/schema/tests), **ESTIMATE** (a reasoned approximation, no benchmark run), **ASSUMPTION** (plausible but unverified), **HYPOTHESIS** (a claim that would need instrumentation/data to confirm).

---

## 1. Mapping the current implementation

### 1.1 End-to-end flow (as implemented, not as named)

```
USER SEARCH (mobile: search/composer.tsx → search/results.tsx)
  │
  ▼
GET /matching/search?originLat&originLng&destinationLat&destinationLng&when
  (apps/api/src/modules/matching/matching.routes.ts:62-74, PUBLIC — no auth)
  │  validated by packages/validation/src/matching.ts:matchingSearchSchema
  ▼
searchRides(db, input)   — apps/api/src/modules/matching/matching.service.ts:529-574
  │
  ├─ Tier 1: scoreCandidates(TIGHT_PICKUP_RADIUS_M=2000, TIGHT_DROPOFF_RADIUS_M=3000, TIGHT_TIME_WINDOW_MIN=90)
  │     → fetchPublishedRidesInWindow(db, windowStart, windowEnd)   [DB query #1]
  │     → getRoute(origin, destination)                             [OSRM call #1, Redis-cached]
  │     → fetchStopsByRide(db, rideIds)                              [DB query #2]
  │     → per-ride: buildEndpointCandidate() — pure, in-memory haversine + polyline overlap
  │     → if any candidates: return tier "exact"
  │
  ├─ Tier 2: scoreCandidates(WIDE_PICKUP_RADIUS_M=8000, WIDE_DROPOFF_RADIUS_M=10000, WIDE_TIME_WINDOW_MIN=240)
  │     → same 2 DB queries + 1 cached OSRM call, again, from scratch
  │     → if any candidates: return tier "wide_corridor"
  │
  ├─ Tier 3: scorePassThroughCandidates(OVERLAP_CORRIDOR_WIDTH_M=150, WIDE_TIME_WINDOW_MIN=240)
  │     → fetchPublishedRidesInWindow again                          [DB query #3]
  │     → fetchStopsByRide again                                     [DB query #4]
  │     → per-ride: decodePolyline + resamplePolyline (≤3000 pts) + projectPointOntoRoute ×2 (origin, dest)
  │     → if any candidates: return tier "route_passthrough"
  │
  └─ Tier 4: findClosestDepartures — wide radius test, 14-day lookahead, no time window
        → fetchPublishedRidesInWindow(now.. +14d)                    [DB query #5]
        → getRoute again (cache hit)                                 [OSRM call #2]
        → fetchStopsByRide again                                     [DB query #6]
        → sort by |departureAt - when|, slice(0, 5)
        → if any: return "closest_departure", else return "none"
  │
  ▼
SearchResult { tier, candidates: MatchCandidate[], message }
  │
  ▼
mobile: useMatchingSearchQuery (RTK Query) → search/results.tsx renders DriverListCard list,
        search/cluster.tsx renders the map, search/pickup-point.tsx / dropoff-point.tsx let the
        rider pick from candidate.rankedStops / rankedDropoffStops
  │
  ▼
POST /bookings { rideId, pickupStopId?, dropoffStopId?, seats } — bookings.service.ts createBooking
  validates pickupStopId/dropoffStopId belong to the ride's isDriverSelected stops, server-side,
  independent of what the client sent as "ranked" (apps/api/src/modules/bookings/bookings.service.ts:87-173)
```

**FACT:** a single search can issue up to **6 sequential Postgres round-trips and 2 OSRM/Redis calls** before returning, because each tier independently re-runs `fetchPublishedRidesInWindow` + `fetchStopsByRide` rather than fetching once at the widest window and filtering in memory for the tighter ones (`matching.service.ts:176-202, 295-333, 353-443, 456-496`). This only happens on the (increasingly rare, as inventory grows) "found nothing tight" path — a healthy corridor with an `exact` match pays only 2 DB queries + 1 cached OSRM call — but it means the *worst-performing* case (sparse corridors, exactly where a rider most needs help) is also the *most expensive* case.

### 1.2 Component inventory with file-level evidence

| Component | File | What it actually does |
|---|---|---|
| Trip/ride creation | `apps/api/src/modules/rides/rides.service.ts` (not read in full this pass, referenced via CLAUDE.md Phase 4/6/13 notes) | Creates `rides` row; `routePolyline`/`estimatedDurationSec` populated from `getRoute()` at creation time |
| Route generation | `apps/api/src/lib/routing.ts:169-216` (`getRoute`) | One OSRM `/route/v1/driving` call, Redis-cached 1h (60s if fallback), haversine straight-line fallback on OSRM failure (`isEstimate: true`) |
| Route geometry storage | `rides.schema.ts:48` | `routePolyline: text` — a Google-polyline-encoded string, **not GeoJSON, not PostGIS geometry** |
| Origin/destination storage | `rides.schema.ts:38-42` | `originLat/Lng`, `destinationLat/Lng` as `doublePrecision` scalar columns — no `geography`/`geometry` type anywhere in the schema |
| Waypoints/stops | `route-stops.schema.ts` | `route_stops` table: `lat/lng doublePrecision`, `sequence`, `isDriverSelected`, `roadClass`, `suitabilityScore`, `deviationMeters/Seconds` |
| Candidate stop generation (driver-side) | `apps/api/src/modules/rides/stop-candidates.service.ts` | Samples the route every ~1km (`SAMPLE_INTERVAL_M`), OSRM `/nearest` snap, rejects `deviationMeters > 300` or `deviationSeconds > 120` outright, classifies road by local speed (no way-class tag available from this OSRM deployment — verified live), clusters within `OVERLAP_CORRIDOR_WIDTH_M`, caches by polyline hash (`cached()`, `lib/cache.ts`) |
| Search request validation | `packages/validation/src/matching.ts` | `matchingSearchSchema`: lat/lng bounds + coerced date, no seats/time-flexibility param |
| Search API | `matching.routes.ts:62-74` | `GET /matching/search`, public, one round trip |
| Candidate retrieval | `matching.service.ts:176-185` (`fetchPublishedRidesInWindow`) | `db.query.rides.findMany({ where: status='published' AND departureAt BETWEEN windowStart/windowEnd })` — **no spatial predicate in the SQL at all** |
| Geographic filtering | `matching.service.ts:212-293` (`buildEndpointCandidate`) | Application-level `haversineDistanceMeters` (`lib/geo.ts:8-19`) computed in JS for every row returned by the (non-spatial) DB query |
| Distance calc | `lib/geo.ts` | Pure great-circle haversine, no road-network awareness |
| Route intersection/proximity | `lib/polyline.ts:128-161` (`projectPointOntoRoute`) | Resamples the OSRM polyline (≤3000 points), linear-scans for nearest sampled vertex — **O(candidates × route length / 25 m)**, not a spatial-index lookup |
| Partial-route matching | `matching.service.ts:353-443` (`scorePassThroughCandidates`) | The `route_passthrough` tier — real, but a genuine fallback tier 3 of 4, not the primary matching mode |
| Direction validation | `matching.service.ts:382` + `lib/polyline.ts:111` (`fraction`) | `destProj.fraction - originProj.fraction >= MIN_ROUTE_FRACTION_GAP (0.02)` — real, correctly rejects reverse-direction |
| Pickup/dropoff matching | `matching.service.ts:118-134` (`rankStopsByWalkDistance`), `:143-152` (`isPickupViable`/`isDropoffViable`) | Pure functions, ranks driver-selected `route_stops` by haversine walk distance, filters beyond `WIDE_PICKUP_RADIUS_M` (8 km) |
| Time matching | `matching.service.ts:236, 302-303, 359-360` | `|ride.departureAt - input.when| ≤ timeWindowMin`; no rider-side flexibility parameter exists in the API contract |
| Detour calculation | `stop-candidates.service.ts:31-38` (driver-side, at ride-publish time only) | **No detour calculated at search time.** Search never asks "how much longer would this driver's trip become to serve this rider" — it only checks whether pre-existing, pre-approved stops happen to be near the rider |
| Ranking | `matching.service.ts:252-255` (endpoint), `:398-402` (passthrough) | Fixed-weight linear formula, no ML, no acceptance-likelihood, no reliability signal in the score itself |
| Sorting | `matching.service.ts:332, 442, 489-495` | In-application `.sort()` after full in-memory scoring |
| Pagination | — | **None.** `exact`/`wide_corridor`/`route_passthrough` return every qualifying ride; only `closest_departure` is capped (`CLOSEST_DEPARTURE_LIMIT = 5`) |
| Caching | `lib/cache.ts`, `lib/routing.ts:169-216` | OSRM route results cached (Redis, 1h/60s); **candidate/search results themselves are never cached** — identical repeated searches always fully recompute |
| Routing-provider calls | `lib/routing.ts` | Self-hosted OSRM only; `getRoute`/`getRouteWithSpeedProfile`/`nearestRoad` all point at `env.OSRM_URL` directly, no provider abstraction |
| Google Maps/Routes API | — | Not used anywhere for routing; `GOOGLE_MAPS_API_KEY` exists only for `react-native-maps`' Android tile rendering (`apps/mobile/.env.example`), unrelated to matching |
| PostGIS/geospatial DB features | — | **None found** — verified by grep across `apps/api` and `docker/` for `postgis`, `ST_DWithin`, `ST_Distance`, `geography`, `geometry(` (zero hits); `docker/docker-compose.yml:3` uses plain `postgres:16-alpine` |
| DB indexes touching search | `rides.schema.ts:54-64`, `route-stops.schema.ts:48-55`, migrations `0002`, `0003`, `0004`, `0013` | `rides(status, departure_at)` composite btree, `rides(driver_profile_id)`, `rides(vehicle_id)`, `rides(route_id)`, `route_stops(ride_id)`, `route_stops(ride_id, is_driver_selected)`, `bookings(pickup_stop_id)`, `bookings(dropoff_stop_id)` — **all btree, zero GiST/spatial** |
| Search-result explanations | `matching.service.ts:160-174` (`buildReasons`), `:513-519` (`TIER_MESSAGES`) | A small fixed set of French reason strings + one tier-level message; not a per-signal breakdown |
| Booking/acceptance signals feeding ranking | — | `driver_profiles.reliabilityScore/ratingAvg/tripCount/punctualityScore/reliabilityPenaltyPoints` exist (`driver-profiles.schema.ts`) and are **read** (`buildReasons` uses `reliabilityScore >= 0.9` for a display string) but **never enter the `score` formula** |
| Tests | `matching/__tests__/matching.service.test.ts`, `matching/__tests__/matching-tiers.integration.test.ts` | Unit tests for pure functions only (`rankStopsByWalkDistance`, `isPickupViable/isDropoffViable`); one real-Postgres(+real-OSRM) integration test covering all 5 tiers with one fixture each |

### 1.3 Failure behavior, per external dependency

| Dependency | Failure mode | Behavior | File |
|---|---|---|---|
| OSRM `/route` (rider's own route, used for endpoint-tier overlap %) | Timeout (4s) / non-2xx / no route | Falls back to haversine straight line, `isEstimate: true`, cached only 60s | `routing.ts:169-216` |
| OSRM `/route` with annotations (used by candidate-stop generation, not search) | Same | Returns `null`, caller skips stop-candidate generation entirely — **no fallback fabrication** | `routing.ts:116-157` |
| Postgres (any tier's `fetchPublishedRidesInWindow`) | Connection error | Unhandled at this layer — propagates as a 500 (Fastify's default error handler); no retry/circuit breaker | inferred from absence of try/catch in `matching.service.ts` |
| Redis (cache) | Unavailable | `getRedis()` returns null-safe; `getRoute`/`cached()` transparently skip caching, calls proceed uncached | `routing.ts:171-176`, `cache.ts` |

---

## 2. What VAYA currently considers a "match"

**Geographic matching — FACT, by tier:**
- `exact`/`wide_corridor`: **origin proximity AND destination proximity** to the ride's own two endpoints, independently (not "near either endpoint" — `buildEndpointCandidate` compares rider-origin↔ride-origin and rider-destination↔ride-destination specifically, which is also what makes it direction-correct — see below).
- `route_passthrough`: **route proximity** — rider's origin and destination each project within 150 m of the ride's actual OSRM polyline.
- No tier does **route containment** in the classic sense (testing whether an entire requested sub-route, not just its two endpoints, stays within a corridor of the driver's route) or **arbitrary detour** search (asking OSRM "what would the driver's trip cost with this rider added").

**Direction — FACT: validated, on every tier, but by two different mechanisms.**
- Endpoint tiers: implicitly direction-correct, because rider-origin is only ever compared to `ride.originLat/Lng` and rider-destination only to `ride.destinationLat/Lng` — a reversed request (Sousse→Tunis vs. Tunis→Sfax) fails both distance checks and is correctly rejected.
- `route_passthrough` tier: explicit fraction-order check, `destProj.fraction - originProj.fraction >= MIN_ROUTE_FRACTION_GAP` (`matching.service.ts:382`) — a rider requesting the reverse direction along the same physical road projects to a *smaller* destination fraction than origin fraction and is rejected.
- **Verdict on the prompt's direction example:** Tunis→Sfax driver vs. Sousse→Tunis passenger correctly returns `NO_MATCH` at every tier (opposite direction). Tunis→Sfax driver vs. Sousse→Gabès passenger: if Sousse and Gabès both lie on/near the real Tunis→Sfax route in the correct order, `route_passthrough` **would** match them (Gabès is south of Sfax on the real map, so in practice this exact pair would fail the corridor-distance test past Sfax — but the mechanism itself is direction-aware and would accept a same-direction pair correctly).

**Partial routes — FACT: supported, but only as tier 3 of 4, and only when the driver has real `route_stops` on both ends.**
Hammamet→Sousse passenger against a Tunis→Sfax driver: if the driver's OSRM route runs through Hammamet and Sousse in order, and the driver has `isDriverSelected` stops within 8 km of each, this is a real `route_passthrough` match (`matching-tiers.integration.test.ts:237-258` proves this exact shape end-to-end against real Postgres + real OSRM). If the driver has **no stops there** (a ride published with zero additional stops — a legitimate, common case per Phase 4's design), the match is silently excluded from this tier rather than surfaced as `pickupViable: false` — a deliberate, documented choice (`matching.service.ts:344-351`), unlike the endpoint tiers which do surface non-viable-but-close matches.

**Extended routes — FACT: NOT supported.** Tunis→Sousse driver vs. Tunis→Monastir passenger (Monastir is past Sousse): `route_passthrough`'s `projectPointOntoRoute` finds the *nearest point on the existing polyline*, which terminates at Sousse — a destination meaningfully beyond the route's physical end will not project within the 150 m corridor width, so this returns `NO_MATCH`. There is no mechanism anywhere in the codebase that asks "could this driver's route be *extended* a bounded amount to reach a point past its published destination." This is a real, distinct gap from partial-route matching — the codebase's own Phase 13 doc names an adjacent but different gap ("partial-direction matching," origin OR destination only) as an explicit non-goal; true endpoint-extension is not named at all and is likewise unhandled.

**Detours — FACT: not calculated at search time, anywhere.**
- No additional-distance / additional-duration / detour-percentage computation exists between a candidate ride and a specific search request.
- Pickup/dropoff "detour" is approximated only as **walk distance from the rider to a pre-existing stop** (`rankStopsByWalkDistance`), which is a passenger-walking cost, not a driver-driving-detour cost.
- The only real driver-detour computation in the codebase (`stop-candidates.service.ts:31-38`, `MAX_DEVIATION_METERS`/`MAX_DEVIATION_SECONDS`) runs once, at ride-publish time, against the driver's own candidate stop set — it is never re-run or referenced per search.

---

## 3. Route geometry audit

**FACT — what's stored:**
- Raw coordinates: yes (`originLat/Lng`, `destinationLat/Lng` on `rides`; `lat/lng` on `route_stops`) — plain `doublePrecision`.
- Google-encoded polyline: yes (`rides.routePolyline: text`, precision 5, from OSRM's own `geometries=polyline` output — `routing.ts:179`).
- GeoJSON: no.
- PostGIS geometry/geography: no — confirmed by grep (zero matches for `postgis`, `geography`, `geometry(` anywhere in `apps/api` or `docker/`) and by `docker-compose.yml:3` using stock `postgres:16-alpine`, not `postgis/postgis`.
- Route distance/duration: yes (`rides.estimatedDurationSec`; distance is not persisted on `rides` — only returned transiently by `getRoute()` at creation time and not stored as a column — **a real, minor gap**: recomputing distance later requires re-decoding/re-summing the polyline or re-calling OSRM).
- Route legs/waypoints: only via `route_stops` (driver-selected, discrete points), not OSRM's leg structure.

**Can the database efficiently answer "which driver routes pass within X km of this pickup point?" — FACT: No.**
There is no spatial column and no spatial index, so this question cannot be asked in SQL at all today. The current answer is computed by (1) a non-spatial SQL query that returns *every* published ride in a time window, then (2) `decodePolyline` + `resamplePolyline` + `projectPointOntoRoute` in Node for each one. This is functionally correct (Track A's design doc is explicit and honest about this — see `phase-13-search-engine.md:39-55`) but it is an O(candidates) application-level scan, not an indexed query. Confirmed by direct code trace, not inference.

**Indexes present, and whether the search query can actually use them:**
- `rides_status_departure_at_idx (status, departure_at)` — **usable**, and is exactly what `fetchPublishedRidesInWindow`'s `WHERE status = 'published' AND departure_at BETWEEN ...` needs (composite, leading columns match the query predicate order). This is a real, correctly-designed index for the one filter the query actually has.
- `route_stops_ride_id_idx`, `route_stops_ride_id_is_driver_selected_idx` — usable by `fetchStopsByRide`'s `WHERE ride_id IN (...) AND is_driver_selected = true`.
- `rides_driver_profile_id_idx`, `rides_vehicle_id_idx`, `rides_route_id_idx`, `bookings_pickup_stop_id_idx`, `bookings_dropoff_stop_id_idx` — not used by the search path at all (FK-integrity/other-query indexes).
- **No GiST, no GIST geography, no functional, no partial indexes exist anywhere in the schema** — confirmed by grepping all 14 migration files for `INDEX` (full list reproduced in §1.2's index row). There is nothing to classify as "present but unused by the query" — the honest finding is that no spatial index exists to evaluate in the first place.

---

## 4. Current query performance

**No `EXPLAIN`/`EXPLAIN ANALYZE` was run** — this audit had no live database with representative data volume to benchmark against, and per the audit's own rules, invented numbers are not acceptable. What follows is architectural reasoning from the code, explicitly labeled.

**FACT:** `fetchPublishedRidesInWindow` uses the one composite index that matches its predicate (`status, departure_at`), so the *initial* row-fetch is index-scoped by status+time, not a full-table sequential scan — this is a real, correctly-built optimization already in place, not a gap.

**FACT:** Everything after that row-fetch (haversine filtering, polyline projection, ranking) is O(N) or worse per search, where N = published rides departing in the tier's time window — **not** filtered by geography in SQL at all. Every row in the window is pulled into the API process and geographically tested in JS, regardless of how far away it actually is.

**ESTIMATE — behavior by scale**, assuming rides are roughly evenly spread over time and the relevant window is a few hours (`exact`/`wide_corridor`) to 14 days (`closest_departure`):

| Trips in DB | Rides typically in a tier's time window | exact/wide_corridor tier | route_passthrough tier | closest_departure tier |
|---|---|---|---|---|
| 100 | low single digits to ~10 | Negligible — a handful of haversine calls | Negligible | Negligible |
| 1,000 | tens | Still cheap (haversine is O(1) per row) | Noticeable but fine — each qualifying-window ride pays one polyline decode+resample+project | Fine, small N × getRoute cache hit |
| 10,000 | low hundreds | Cheap in isolation, but now 4-6 sequential DB round-trips per full-cascade search add up under concurrent load | Each search touching this tier does hundreds of polyline projections (≤3000 samples each) synchronously on the Node event loop — **ESTIMATE: this is where single-threaded CPU cost starts becoming visible**, especially under concurrent searches | 14-day lookahead with no DB-side LIMIT means the query can return every published ride in two weeks before the app-level `.slice(0,5)` — **ASSUMPTION: this becomes the single most expensive tier at this scale**, precisely because it has the widest window and no spatial or count bound in SQL |
| 100,000 | thousands | Composite index still helps, but "thousands of rows, JS-side haversine + relational `with` hydration" per tier starts being a real per-request cost | **HYPOTHESIS: real risk of event-loop stalls** — `scorePassThroughCandidates` iterating thousands of candidate rides, each doing an up-to-3000-sample linear scan, done synchronously, would materially raise p99 latency for *every* concurrent request the API is serving, not just the slow search itself | Same 14-day-unbounded-fetch problem, now at real scale — this is the query most likely to need a hard rethink first |
| 1,000,000 | tens of thousands+ | Composite index alone insufficient without a spatial pre-filter; the current architecture's core assumption (fetch-then-filter-in-app) breaks down | Not viable without a spatial index or a bounding-box pre-filter before polyline projection | Definitely not viable unbounded — needs a `LIMIT` pushed into SQL and/or a materialized "next departure per corridor" structure |

This table is architectural reasoning, not a measured benchmark — it should be read as "where the current design's assumptions start to strain," not as a promise of a specific latency number. **The recommended concrete benchmark** (not performed here): seed 10k/100k synthetic published rides with realistic Tunisia-wide geographic spread and time distribution, run `EXPLAIN ANALYZE` on the literal `fetchPublishedRidesInWindow` query at each volume, and separately time `scorePassThroughCandidates`'s in-process work with `console.time`/a profiler at 1k/10k in-window candidate counts, since that is the code path with no SQL-level bound at all today.

**N+1 patterns found:** none inside a single tier's loop — `buildEndpointCandidate` is a pure, synchronous function fed pre-batched `stopsByRide` and `riderRoutePoints`; there is no per-row DB or OSRM call inside any `for` loop. The real inefficiency is **cross-tier redundancy** (§1.1): up to 4 independent `fetchPublishedRidesInWindow` calls with overlapping time windows in the same request, and 4 independent `fetchStopsByRide` calls for likely-overlapping ride-ID sets, when the tiers fall through in sequence.

---

## 5. Comparison against publicly documented BlaBlaCar engineering concepts

*(Restricted to publicly described BlaBlaCar engineering concepts, as instructed — not claiming knowledge of proprietary internals.)*

**A. Gross (cheap, PostGIS-based) matching, then precise routing-based detour.** BlaBlaCar has publicly described a two-phase approach: a cheap PostGIS geographic pass to narrow candidates, then routing-service calls only against that narrowed set. **VAYA has half of this concept, inverted in cost order.** VAYA's cheap phase is real (haversine, in JS, is genuinely cheap per-row) but it is *not* a database-level spatial pre-filter — it still requires pulling every time-windowed row out of Postgres first. The narrowing that BlaBlaCar's PostGIS phase does at the SQL layer, VAYA does at the application layer after the full row-set is already fetched. The second phase (expensive, routing-aware) is real too (`scorePassThroughCandidates`'s polyline projection), but because there's no spatial pre-filter, it runs against every ride in the time window rather than only against a geographically-plausible subset — i.e., VAYA sometimes pays phase-2 cost for candidates a real gross-match phase would have already excluded.

**B. Actual detour calculation via routing/map services.** BlaBlaCar has described using routing services to compute the real detour cost of adding a stop, considering the actual road network. **VAYA does not do this at search time at all** (§2). It has the ingredients (OSRM is already wired, `getRouteWithSpeedProfile` exists) but detour is only ever computed once, at ride-publish time, for the driver's own pre-selected stops — never per search, never for a specific rider's specific request.

**C. Boost-style partial matching.** BlaBlaCar has publicly described "Boost" rides, where a published journey can serve passengers needing a short deviation from the route. **VAYA's closest equivalent is the `route_passthrough` tier**, which is a real, working analog for the case where the deviation is *zero* (the rider's points already sit on the existing route/stops). VAYA has **no mechanism for a genuine short deviation** — a rider 1.5 km off the driver's route, with no existing stop nearby, is simply excluded today; there is no live "would a small detour make this ride viable" calculation, unlike the described Boost concept.

**D. Materialized/precomputed search data.** BlaBlaCar has publicly described using materialized/pre-transformed trip data for matching performance. **VAYA has none of this for search itself.** The closest analog anywhere in the codebase is `stop-candidates.service.ts`'s Redis cache of *candidate-stop generation* results, keyed by route-polyline hash — a real precomputation pattern, but scoped to driver-side stop generation, not to the search/matching read path. No materialized view, denormalized search table, or precomputed corridor index exists for `searchRides`.

**E. Spatial indexing.** BlaBlaCar has publicly discussed PostGIS spatial indexing to reduce matching cost. **VAYA has zero spatial indexes** (§3) — this is the single most consequential structural gap relative to the publicly documented BlaBlaCar approach, and it is the direct cause of §4's scaling concerns.

**F. ML-based ranking / Smart Selection (predicting acceptance likelihood).** BlaBlaCar has publicly described ML-based candidate selection, including predicting whether a driver will accept a request. **Should VAYA use this now? No — and the codebase's own data confirms why, independent of "BlaBlaCar does it."** `bookings` records `status` transitions (accepted/declined/cancelled — confirmed in Phase 1/10's notes and the `bookings.schema.ts` state machine), and `driver_profiles` carries `reliabilityScore`/`ratingAvg`/`tripCount`/`punctualityScore`/`reliabilityPenaltyPoints`. But: (1) none of these signals currently feed the `score` formula at all (§1.2's last row) — even deterministic/heuristic weighting of existing signals is unbuilt, let alone ML; (2) there is no event pipeline capturing *search → impression → click* (`apps/mobile/src/services/analytics/analytics.ts:16-21` is a `console.log`-only stub with an explicit comment stating "there is no analytics/telemetry infrastructure anywhere in this codebase yet"); (3) an ML acceptance-predictor needs a labeled dataset of (search context, candidate, shown/clicked/accepted) tuples that does not exist and cannot exist until an event pipeline is built and run for a meaningful period. **Verdict: deterministic hard filters + heuristic scoring is the correct choice today; ML ranking is not just premature but currently impossible for lack of training data**, independent of whether BlaBlaCar itself uses ML.

---

## 6. Gap analysis

| Capability | VAYA Today | World-Class Target | Gap | Severity | Evidence |
|---|---|---|---|---|---|
| Exact route matching | Real, tight-radius+time endpoint test | Same | None | — | `matching.service.ts:529-537` |
| Partial route matching | Real, tier 3 of 4, requires real stops on both ends | Same, but as a first-class candidate-generation input, not a last-resort fallback | Moderate — correct but positioned as fallback, and gated by stop existence rather than a live "could a stop be added here" check | Medium | `matching.service.ts:353-443` |
| Route geometry | Encoded polyline (text), scalar lat/lng | PostGIS `geography(LineString)` / `geography(Point)` | Large | High (blocks everything else at scale) | Schema files, §3 |
| Route proximity | App-level polyline resampling + nearest-vertex scan | DB-level `ST_DWithin`/`ST_Distance` on indexed geography | Large | High | `lib/polyline.ts:128-161` |
| Route direction | Real, correctly enforced (both tier types) | Same | None | — | §2 |
| Route position (fraction along route) | Real (`projectPointOntoRoute.fraction`) | Same | None | — | `lib/polyline.ts:111,156-159` |
| Pickup feasibility | Real (`isPickupViable`, walk-radius filtered) | Same, plus live "could a new stop be added" check | Small-Medium | Medium | `matching.service.ts:143-145` |
| Dropoff feasibility | Real (`isDropoffViable`, Phase 13) | Same | None (symmetric with pickup) | — | `matching.service.ts:150-152` |
| Temporal matching | Fixed windows (90/240 min), no rider flexibility param | Rider-settable flexibility, driver-settable flexibility | Small-Medium | Low-Medium | `matchingSearchSchema` has no flexibility field |
| Detour distance | Not computed at search time | Computed per search against driver's real route | Large | High for Boost-style matching, Low for current scope | §2, §5B |
| Detour duration | Not computed at search time | Same | Large | Same as above | Same |
| Driver flexibility (accept a short detour) | Not modeled | Boost-style opt-in | Large | Medium (real product feature gap, not correctness bug) | §5C |
| Passenger flexibility (time window) | Not modeled in API | Optional flexibility param feeding tier selection | Medium | Low-Medium | `matchingSearchSchema` |
| Meeting points | Real (`route_stops`, driver-curated) | Same | None | — | Phase 4/5 (CLAUDE.md status) |
| Candidate generation | Full time-windowed table scan, no spatial pre-filter | Spatial index-backed candidate set before scoring | Large | High at scale, Low today | §3, §4 |
| PostGIS | Absent | Present (NEXT/SCALE per `docs/architecture/overview.md:85,91`) | Large | Deferred by design — **not a P0/P1 gap**, a scheduled SCALE item | `docs/architecture/overview.md:79,91` |
| Spatial indexes | Absent (btree only) | GiST | Large | Same as PostGIS — trigger-based, not urgent yet | §3 |
| Temporal indexes | Present and correctly matched to the query (`status, departure_at`) | Same | None | — | `rides.schema.ts:57-60` |
| Routing API usage | Self-hosted OSRM, direct calls, no abstraction layer | Provider-agnostic interface | Small | Low (works today, portability risk only) | `lib/routing.ts` |
| Routing API caching | Real (Redis, 1h/60s TTL, coordinate-rounded cache key) | Same | None | — | `routing.ts:169-216` |
| Ranking | Fixed-weight deterministic formula, no reliability/acceptance signal | Heuristic scoring incorporating reliability, then eventually ML once data exists | Medium | Medium | `matching.service.ts:252-255,398-402` |
| Explainability | Small fixed reason-string set + one tier message | Structured, quantified per-signal explanation (§11) | Medium | Low-Medium | `buildReasons`, `TIER_MESSAGES` |
| Result diversity | None (pure score sort, could return many results from one driver's re-published rides — not deduplicated by driver) | Deliberate diversification (avoid all-top-slots-one-driver) | Small | Low (edge case at current inventory scale) | `matching.service.ts:319-333` |
| Reliability signals stored | Real, rich (`driver_profiles.reliabilityScore` etc.) | Same, and actually used in ranking | Medium (stored but unused) | Medium | `driver-profiles.schema.ts` vs. `score` formula |
| Cancellation signals | Real, stored (`reliabilityPenaltyPoints`, Phase 10) | Same, feeding ranking | Medium (stored but unused in search) | Medium | Same pattern |
| Acceptance signals | Booking status transitions exist; no aggregate "acceptance rate" field or use in ranking | Aggregate signal, used in ranking/ML | Medium | Low-Medium (no data pipeline to compute it from yet) | Inferred from schema — no `acceptanceRate` column anywhere |
| Search analytics | `console.log` dev stub only — explicitly documented as such | Real event pipeline (search/impression/click/booking) | Large | High (blocks §14's entire learning loop) | `analytics.ts:1-21` |
| Experimentation | None | A/B-testable ranking weights | Large | Low now (no traffic/infra to run experiments on yet) | Absent from codebase |
| ML readiness | Not ready — no event pipeline, no labeled outcomes | N/A until data exists | Large | Not urgent — correctly deferred per §5F | §5F |
| Scalability | Adequate for NOW/NEXT per the codebase's own documented, deliberate strategy | PostGIS + read replicas at SCALE | Large but explicitly scheduled, not neglected | Medium, correctly deferred | `docs/architecture/overview.md:70-97` |
| Observability | Structured logging via Fastify/pino present generically; no matching-specific latency/error tracking | Dedicated tracing on search/matching endpoints | Medium | Medium | No APM/tracing code found in `matching.*` |
| Automated tests | Unit tests for pure functions + one real-Postgres/real-OSRM integration test covering all 5 tiers | Same, plus load/perf tests, plus a larger synthetic edge-case matrix | Medium | Medium | §13 |

---

## 7. The correct matching model for VAYA

Given `A → B` (driver) and `P → Q` (rider), is `A → P → Q → B` feasible? **Only sometimes, and VAYA's current model already encodes the right constraint, just not under this exact taxonomy.** The two things that must both hold, verified against VAYA's actual route semantics (not a blind formula):

1. **Order on the route:** P must project onto the driver's route *before* Q, by a non-trivial margin (`MIN_ROUTE_FRACTION_GAP`) — already enforced (`matching.service.ts:382`).
2. **Actual bookability:** P and Q must each be reachable through a real, driver-approved `route_stops` entry, not a raw geometric point — already enforced (`matching.service.ts:344-351,384-387`), and correctly so per CLAUDE.md's product principle #1 (no free-form pickup/dropoff).

What VAYA's model does **not** yet do, that the prompt's formula implies: allow `P` before `A` or `Q` after `B` (extension beyond the driver's published endpoints) — deliberately unsupported today (§2), and reasonably so as a first cut, since it requires either re-routing the driver's whole trip or presenting a hypothetical extension the driver never agreed to.

**Recommended category taxonomy for VAYA** (reusing existing `matchType`/`tier` fields rather than inventing a parallel system):

| Category | Maps to today's | Definition |
|---|---|---|
| `EXACT_MATCH` | `tier: 'exact'` | Ride's own endpoints are both close to the rider's, at the requested time |
| `PARTIAL_ROUTE_MATCH` | `tier: 'route_passthrough'` | Rider's origin/destination both project onto the driver's actual route, in order, through real stops |
| `WIDE_MATCH` (rename `wide_corridor` conceptually) | `tier: 'wide_corridor'` | Same as exact, looser radius/time — this is really a *relaxed* `EXACT_MATCH`, not a distinct category; keep it as a tier, not a new top-level category |
| `DETOUR_MATCH` | **does not exist yet** | A ride whose route does *not* already pass near the rider, but could reach them within a small, computed detour bound — the real gap identified in §5C/§6 |
| `EXTENDED_ROUTE_MATCH` | **does not exist yet** | A ride whose endpoint could be extended a bounded distance to reach the rider — the gap identified in §2 |
| `NO_MATCH` | `tier: 'none'` | Nothing within the 14-day lookahead on this corridor |

Recommendation: introduce `DETOUR_MATCH` before `EXTENDED_ROUTE_MATCH` — a detour calculation is the higher-leverage, more BlaBlaCar-aligned addition (§5B/§5C), and extension-beyond-endpoint is a narrower, lower-frequency case.

---

## 8. Hard filters vs. ranking signals

**Hard feasibility filters (must be a strict gate, never just a downweight) — current state:**

| Filter | Enforced today? | Where |
|---|---|---|
| Ride status = published | Yes | `fetchPublishedRidesInWindow` |
| Seats available ≥ 1 | Yes | `buildEndpointCandidate:224`, `scorePassThroughCandidates:373` |
| Departure time window | Yes (per-tier fixed windows) | `matching.service.ts:302-303,359-360` |
| Route direction (order) | Yes, passthrough tier | `matching.service.ts:382` |
| Pickup ordering vs. dropoff ordering | Yes (same mechanism) | Same |
| Maximum pickup distance | Yes (tier-specific radius) | `TIGHT_PICKUP_RADIUS_M`/`WIDE_PICKUP_RADIUS_M` |
| Maximum dropoff distance | Yes | `TIGHT_DROPOFF_RADIUS_M`/`WIDE_DROPOFF_RADIUS_M` |
| Maximum detour distance/duration | **Not applied at search time** (only at driver stop-generation time) | `stop-candidates.service.ts` only |
| Time feasibility (can rider realistically reach the stop before departure) | **Not checked** — walk time isn't compared against time-until-departure | Absent |

**Recommended additional hard filters for VAYA specifically** (not a generic list — reasoned from VAYA's actual constraints): a maximum pickup walk time relative to time-until-departure (a 12-minute walk to a stop departing in 5 minutes is not really "viable" even though it passes the radius test today); a maximum total detour bound once `DETOUR_MATCH` (§7) is built, mirroring `stop-candidates.service.ts`'s existing 300 m/120 s driver-side thresholds so search-time and publish-time detour tolerance stay consistent rather than diverging.

**Ranking signals — current state vs. recommendation:**

| Signal | Used today? | Should it matter? | Why |
|---|---|---|---|
| Route overlap % | Yes (`routeOverlapPercent`, weighted 0 directly in formula — actually only pickup/time/dropoff distance are weighted; overlap% is computed and shown but not in the `score` sum for endpoint tier) | Yes, and it should be *in* the score, not just displayed | Currently a **discrepancy**: `routeOverlapPercent` is computed (`matching.service.ts:244-250`) and surfaced to the client but the `score` formula (`:252-255`) never references it — worth flagging as a real, minor bug/gap, not just a missing feature |
| Pickup convenience | Yes (0.4 weight) | Yes | Core to rider experience |
| Dropoff convenience | Yes (0.3 weight) | Yes | Same |
| Time difference | Yes (0.3 weight) | Yes | Same |
| Detour cost | No | Yes, once computed (§5B) | Currently walk-distance is a proxy for detour, conflating two different costs (rider walking vs. driver driving) |
| Driver reliability/rating | Displayed only, not scored | Yes, as a signal (not the dominant one) | Data exists (`reliabilityScore`), unused in ranking — cheap win |
| Cancellation/no-show rate | Stored (`reliabilityPenaltyPoints`), not scored | Yes, as a light penalty | Same — cheap win, data already exists from Phase 10 |
| Completion rate | Not a distinct stored field (`tripCount` exists but not a completion *ratio*) | Yes, once derivable | Needs a small aggregate, not a new data source |
| Historical acceptance rate | Not stored anywhere | Eventually, once an event pipeline exists (§5F, §14) | Correctly deferred — no data yet |
| Price | Not a ranking signal (not even used as a soft signal today) | Debatable — a lower price shouldn't dominate a marketplace ranking (race-to-the-bottom risk on a fixed-bound pricing model) but could break near-ties | Low priority — VAYA's pricing is already bounded/computed (Phase 6), so price variance between candidates is naturally small |
| Rating (numeric avg) | Displayed only | Same as reliability — light signal, not dominant | `ratingAvg` exists, unused in `score` |

**Recommendation: do not collapse all of this into one opaque score.** Keep the current two-part shape (hard filters gate → weighted formula ranks) but (1) fix the `routeOverlapPercent`-computed-but-unused discrepancy, (2) add reliability/cancellation as small, capped weight terms (e.g. ≤10% of total score combined) so they nudge rather than dominate, consistent with the instruction not to turn everything into one arbitrary score.

---

## 9. Ideal search pipeline (target design)

| Stage | Responsibility | Input | Output | DB tech | Cost | Cached? | Sync? | Failure behavior |
|---|---|---|---|---|---|---|---|---|
| 1. Normalize | Validate/coerce lat/lng/time, resolve rider flexibility defaults | Raw query params | `MatchingSearchInput` | — | Trivial | No | Sync | 400 on invalid input (already the case via Zod) |
| 2. Cheap candidate generation | Pull only geographically-plausible, time-windowed published rides | Normalized input | Row set (bounded) | Postgres, spatial index (future) or bounding-box btree (near-term) | Low, index-backed | No (data changes too fast) | Sync | Empty result falls through the tier cascade, not an error |
| 3. Spatial filtering | Precise distance/corridor test | Row set + rider point(s) | Filtered row set | App-level (as today) or `ST_DWithin` (future) | Low-medium | No | Sync | N/A |
| 4. Temporal filtering | Apply tier's time window | Filtered set | Filtered set | Already folded into stage 2's query today (reasonable) | Trivial | No | Sync | N/A |
| 5. Direction/order validation | Reject reverse-direction/degenerate matches | Filtered set | Filtered set | App-level | Trivial | No | Sync | N/A |
| 6. Route-position analysis | `projectPointOntoRoute` fraction/distance | Candidate + polyline | Position data | App-level | Medium (the current expensive step) — **candidate for a spatial pre-filter to shrink N before this runs** | Per-ride, could be memoized by polyline hash if route rarely changes | Sync today; **should be made async/batched or offloaded** once volume grows (§4) | Skip ride if no polyline (already the case) |
| 7. Cheap feasibility filtering | Stop-viability check (`isPickupViable`/`isDropoffViable`) | Position data + `route_stops` | Bookable candidates | App-level, pre-batched query | Low | No | Sync | Excluded from passthrough tier, surfaced flagged for endpoint tiers (existing, correct, asymmetric-by-design behavior) |
| 8. Exact routing/detour calculation | **New** — real OSRM detour cost for `DETOUR_MATCH` candidates only | Narrowed candidate set (already spatially filtered) | Detour distance/duration | OSRM, cached | Medium-high per call — **must only run on an already-narrow set**, never on the full window | Yes, keyed by (ride route hash, rider point) | Async-safe, should not block the whole request if slow | Timeout → exclude that one candidate from `DETOUR_MATCH`, don't fail the whole search |
| 9. Hard feasibility gate | Final strict filters (seats, detour bound, walk-time-vs-departure) | Scored candidates | Bookable candidates | App-level | Trivial | No | Sync | N/A |
| 10. Ranking | Weighted scoring incl. reliability/cancellation signals | Bookable candidates | Sorted list | App-level | Low | No | Sync | N/A |
| 11. Result diversification | Avoid one driver dominating all slots | Sorted list | Diversified list | App-level | Trivial | No | Sync | Only relevant once inventory is dense enough to matter |
| 12. Match explanation | Attach the quantified reasons (§11) | Scored candidate | `reasons[]` + numeric breakdown | App-level | Trivial | No | Sync | N/A |
| 13. Search response | Tier + candidates + message (as today) | All of the above | `SearchResult` | — | — | — | — | — |

This is **evolutionary, not a rewrite** of the current pipeline — stages 1, 3, 4, 5, 6, 7, 9, 10 (partially), 12, 13 already exist and are structurally sound; stage 2 needs a spatial pre-filter before stage 6 to avoid running expensive polyline projection against geographically implausible rows, and stage 8 (real detour calculation) is the one genuinely new capability.

---

## 10. Routing API usage — critical analysis

- **Calls per search:** 1–2 OSRM calls (`getRoute` for the rider's own origin→destination, called from `scoreCandidates` and again from `findClosestDepartures`), both hitting the same Redis cache key (`route:{originLat.toFixed(5)},...`) — so in practice this is 1 real OSRM network call plus 1 Redis hit in the worst case, not 2 real OSRM calls. **This part is well-designed.**
- **Can a single search cause N routing requests (one per candidate)?** No — verified directly: `scorePassThroughCandidates` and `buildEndpointCandidate` never call OSRM per-ride; they only decode/project the ride's *already-stored* `routePolyline` (computed once, at ride-creation time). This is a correct, important design choice that avoids the classic N+1-routing-calls trap.
- **Are repeated origin/destination pairs cached?** Yes, coordinate-rounded to 5 decimal places (~1.1 m precision) as the cache key (`routing.ts:170`).
- **Batching:** Not applicable — OSRM's `/route` endpoint here is called for single origin/destination pairs, not in bulk; there's no batch-routing use case in the current design since per-candidate OSRM calls were correctly avoided.
- **Candidate cap before routing:** N/A today (no per-search candidate-specific routing calls exist yet) — **will become necessary the moment `DETOUR_MATCH` (§7/§9) is added**, since that stage does need a real per-candidate OSRM call; the pipeline design in §9 stage 8 explicitly scopes it to run only after spatial narrowing, for exactly this reason.
- **Is routing called before or after cheap filtering?** After — `getRoute` for the rider's own route is called once per tier attempt regardless of candidate count (fine, it's for the rider not per-candidate); no per-candidate routing exists yet to sequence.
- **Slow provider:** `FETCH_TIMEOUT_MS = 4000` (`routing.ts:11`) aborts and falls back to haversine (`getRoute`) or returns `null` (`getRouteWithSpeedProfile`, `nearestRoad`) — a real, bounded timeout exists on every OSRM call path.
- **Provider failure:** Falls back to a clearly-flagged (`isEstimate: true`) straight-line estimate for `getRoute`; hard-skips (no fabrication) for the annotated-route/nearest-road paths used by stop generation — consistent with CLAUDE.md's "never fabricate" rule.
- **Quota exceeded:** N/A — self-hosted OSRM has no quota concept; this becomes relevant only if VAYA ever migrates to a metered third-party provider.

**Recommended routing-provider abstraction:** introduce a thin `RoutingProvider` interface (`getRoute`, `getRouteWithSpeedProfile`, `nearestRoad`) that `lib/routing.ts`'s current OSRM-specific functions implement, so a future managed-provider swap (mentioned as a SCALE-horizon option in `docs/architecture/overview.md:95`) doesn't require touching every call site. This is a small, mechanical refactor-shaped recommendation — not proposed as urgent, since self-hosted OSRM is explicitly a protected asset (CLAUDE.md's "Things that must NOT be changed casually") and there is no current business need to switch providers.

---

## 11. Search result quality / explainability

**Can VAYA currently answer "why is this driver a good match?" — Partially.**

| Ideal explanation signal | Available today? | Source |
|---|---|---|
| Route overlap % | **Computed, and even returned to the client** (`routeOverlapPercent`) | `matching.service.ts:244-250,273` |
| Pickup distance from route/rider | Available as `pickupWalkMinutes`, not raw meters | `matching.service.ts:71` |
| Dropoff distance from route/rider | Available client-side only, computed in `search/results.tsx:104-110` from real stop/destination coordinates — **not returned by the API itself as a field**, recomputed ad hoc in the UI | `results.tsx` |
| Driver detour (minutes) | **Not available** — never computed at search time (§2) | — |
| Passenger arrival-within-requested-time | Implicit via `timeDeltaMin`/`clusterLabel`, not surfaced as an explicit "arrives at X, Y min from your requested time" | `buildClusterLabel` |
| Structured per-signal breakdown | No — only a curated set of French strings (`buildReasons`) plus one tier-level message | `matching.service.ts:160-174,513-519` |

**Verdict:** the raw ingredients for a genuinely explainable result (route overlap %, walk minutes, time delta) mostly already exist server-side, but are exposed as a handful of threshold-gated display strings rather than a structured, quantified breakdown — and the dropoff-walk-distance case shows the API/UI boundary already leaking a computation that should live server-side (recomputing it per-card in `results.tsx` risks drift from whatever the server itself considered "viable"). This is a real, low-effort improvement opportunity: return the quantified numbers already being computed (`routeOverlapPercent`, `pickupWalkMinutes`, a new `dropoffWalkMinutes`, `timeDeltaMin`) as first-class response fields instead of only deriving display strings from them, and let the client render explanations from real numbers rather than recomputing distance client-side.

---

## 12. Edge-case analysis

| # | Scenario | Current behavior | Expected behavior | Pass/Fail | Why |
|---|---|---|---|---|---|
| 1 | Driver A→B, passenger A→B | `exact` tier match | Same | **PASS** | Direct endpoint test |
| 2 | Driver A→C, passenger A→B (B short of C) | Fails endpoint tiers unless B within wide-dropoff-radius of C; may match `route_passthrough` if B is a real stop near the route | Should match via partial-route if B is genuinely on the route | **PASS** (via `route_passthrough`, when stops exist) / **borderline FAIL** if driver has no stops near B (excluded rather than flagged) | `matching.service.ts:384-387` excludes rather than surfaces `pickupViable:false` for passthrough |
| 3 | Driver A→C, passenger B→C (B short of A... i.e. mid-route to endpoint) | Same as #2, mirrored | Same | **PASS**/borderline as #2 | Same mechanism |
| 4 | Driver A→C, passenger B→D, D beyond C | No tier matches (destination projects near route's terminus, likely fails corridor width unless D is literally adjacent to C) | Ideally `EXTENDED_ROUTE_MATCH` (not built) or a clean `NO_MATCH` | **FAIL** (silently `NO_MATCH`, no distinct signal that "D is just past your destination") | §2, §7 — extension not modeled |
| 5 | Driver A→C, passenger C→A (reverse) | Correctly rejected at every tier | Reject | **PASS** | §2 direction analysis |
| 6 | Driver A→C, passenger D→B, D/B geographically close to C/A but reversed | Correctly rejected — rider-origin compared only to `ride.originLat/Lng`, not "nearest endpoint" | Reject | **PASS** | `buildEndpointCandidate:226-234` compares origin↔origin, destination↔destination specifically |
| 7 | Pickup slightly off driver's route | Matches if within `OVERLAP_CORRIDOR_WIDTH_M` (150m) and a real stop exists nearby; otherwise excluded | Match with a small, bounded, calculated detour offer | **PARTIAL PASS** — works only when a pre-existing stop happens to be there | §5C — no live Boost-style detour |
| 8 | Dropoff slightly off driver's route | Same as #7, symmetric | Same | **PARTIAL PASS** | Same |
| 9 | Both pickup and dropoff require detours | Excluded (both must independently have real viable stops) | Combined-detour bounded offer | **FAIL** (excluded, not offered) | §5C |
| 10 | Pickup close to route, dropoff far away | `pickupViable: true`, `dropoffViable: false` — surfaced (endpoint tiers) or excluded (passthrough tier) | Surfaced with an honest "pickup works, dropoff doesn't" state | **PASS** for endpoint tiers (this is exactly what `pickupViable`/`dropoffViable` are for), **excluded silently** for passthrough | `matching.service.ts:92-102` documents this asymmetry deliberately |
| 11 | Route crosses passenger origin/destination multiple times (e.g., a loop) | `projectPointOntoRoute` returns the single nearest sample — first/only occurrence found by minimum distance, not all occurrences | Undefined/ambiguous either way for a carpooling context (loops are rare/unrealistic for point-to-point rides) | **PASS by irrelevance** — not a realistic VAYA scenario given OSRM driving routes are not loops for A→B requests | `lib/polyline.ts:146-154` (nearest-vertex scan) |
| 12 | Driver has intermediate stops | Fully modeled (`route_stops`, `sequence`) | Same | **PASS** | Core Phase 4/5 feature |
| 13 | Multiple passengers require different detours | Not applicable — detours aren't computed live at all yet (§9's coordination of *multiple simultaneous* detour requests is a further-out concern than single-detour support itself) | Each request independently evaluated against remaining seats/route capacity | **N/A / FAIL** (prerequisite feature missing) | §5B/§5C |
| 14 | Driver has limited seats | Enforced (`seatsAvailable < 1` hard-rejects) | Same | **PASS** | `matching.service.ts:224,373` |
| 15 | Driver departure flexibility | Not modeled — a ride has one fixed `departureAt` | A driver-settable flexibility window | **FAIL (not built)** | No such field in `rides.schema.ts` |
| 16 | Passenger departure flexibility | Not modeled in the API (`matchingSearchSchema` has no flexibility param) — only the *tier system itself* provides implicit flexibility by widening | An explicit rider-settable flexibility param feeding tier logic | **PARTIAL** (tier cascade approximates this well without an explicit param) | `packages/validation/src/matching.ts` |
| 17 | Very long trip (e.g., Tunis→Sfax, ~270km) | `resamplePolyline`'s sample count is capped at 3000 (`targetSpacingM=25` → `routeLength/25` capped) — correctly bounded, doesn't degrade to O(route length) unboundedly | Same | **PASS** | `lib/polyline.ts:141` |
| 18 | Very short trip | `sampleCount` floors at 50 (`Math.max(50, ...)`) — avoids degenerate under-sampling | Same | **PASS** | Same line |
| 19 | Urban dense roads | Haversine/corridor-width approximation doesn't account for one-way streets, blocked turns, or genuine walking-network topology (a 150m great-circle distance can be much further by actual streets) | Ideally road-network-aware walk distance, not straight-line | **PARTIAL FAIL** (works approximately, systematically optimistic in dense urban grids) | `lib/geo.ts` is pure great-circle, no road network |
| 20 | Rural roads | Straight-line approximation is *more* accurate here (fewer obstructions) — the same limitation as #19 is less severe | Same | **PASS (relatively)** | Same reasoning, inverted |
| 21 | Multiple geographically similar cities (e.g., Tunis's dense metro sprawl) | No special handling — purely coordinate-distance-based, no place-disambiguation logic in matching itself (geocoding/labeling happens upstream) | Same as any other case, assuming upstream geocoding is correct | **PASS by delegation** — this is a geocoding-layer concern, not a matching-layer one | Out of `matching.service.ts`'s scope by design |
| 22 | Missing/incorrect geocoding | Matching trusts whatever lat/lng it's given — no validation that a point is plausible/on land/in Tunisia | Same trust boundary is reasonable; geocoding correctness belongs to `geocoding.service.ts`, not matching | **PASS by delegation**, but no defensive check either | `matchingSearchSchema` only bounds-checks lat/lng globally (-90..90/-180..180), not to Tunisia |
| 23 | Routing API unavailable | `getRoute` falls back to haversine straight-line (`isEstimate: true`); `route_passthrough` tier is entirely skipped for rides with no polyline, and the rider's own route becomes a straight line (only affects the overlap-% display, not the hard filter) | Should degrade gracefully, honestly labeled | **PASS** | `routing.ts:159-167,199-205`; `matching.service.ts:374` |
| 24 | Stale route geometry (driver's route changed after publish, e.g., roadworks) | `routePolyline` is fixed at creation time — never re-fetched or invalidated by matching | Acceptable for now (routes don't change after publish in VAYA's model — a ride's `origin/destination` are fixed once published) | **PASS by design** — not a bug, matches the product's actual invariant (published rides don't get re-routed) | `rides.schema.ts` has no route-regeneration trigger, consistent with the ride being an immutable-once-published offer |
| 25 | Trip updated after indexing | No caching of search results exists (§1.2), so every search re-reads live `rides`/`route_stops` rows — there is no stale-index problem *because there is no index to go stale* | Same conclusion holds even after a future spatial-index addition, as long as the index itself is kept live (not a batch-refreshed materialized view) | **PASS** (today) — **flag for future**: if a materialized/precomputed layer (§5D) is ever added, staleness becomes a real concern to design against | — |

**Summary:** 15 of 25 scenarios are handled correctly today (including several genuinely tricky ones — direction validation, reverse-proximity rejection, long/short-route sampling bounds, graceful OSRM-failure degradation). The failing/partial scenarios cluster almost entirely around **detour/Boost-style matching** (#7-10, #13) and **route extension** (#4) — a coherent, single underlying gap (§7/§9's `DETOUR_MATCH`), not 10 unrelated problems.

---

## 13. Testing audit

**What exists:**
- Unit tests: `matching.service.test.ts` — pure-function coverage of `rankStopsByWalkDistance`/`isPickupViable`/`isDropoffViable` only (not `buildEndpointCandidate`, `scorePassThroughCandidates`, or `findClosestDepartures` as pure units — those are exercised only via the integration test below).
- `lib/__tests__/polyline.test.ts` exists (not read in full this pass, but confirmed present) — covers the geometric primitives `projectPointOntoRoute`/`computeRouteOverlapFraction` likely sit behind.
- Integration test (real Postgres + real OSRM): `matching-tiers.integration.test.ts` — one fixture per tier (`exact`, `wide_corridor`, `route_passthrough`, `closest_departure`, `none`), asserting the cascade returns the correct tier and doesn't silently fall through to `none` when a looser tier has data. Genuinely exercises the real stack, not mocks — a real strength.
- E2E: `tests/e2e/tests/search-to-booking.api.test.ts` (263 lines) — full HTTP-level core-loop coverage per CLAUDE.md's Phase 5 notes (driver onboarding → OSRM-backed stop generation → publish → search → booking with `pickupStopId`, both rejection cases, legacy free-form booking).
- Database tests: implicit via the integration tests running against real Postgres — no dedicated schema/migration tests.
- Routing-provider mocks: none found for `matching.service.ts`'s own tests — it either uses the real OSRM instance (integration test) or avoids OSRM entirely (pure unit tests operate on synthetic stop lists, not polylines).

**What does not exist:**
- PostGIS tests (N/A — no PostGIS yet).
- Dedicated regression tests for the specific edge cases in §12 beyond what the 5-tier integration fixture happens to cover (it covers scenarios #1, #2/3 partially via route_passthrough, #5/#6 only implicitly through the direction-check unit not being separately tested, #17/#18 not directly tested at the `matching.service.ts` level).
- Performance/load tests: none.
- A direct unit test for `buildEndpointCandidate`'s scoring math itself (weights, clamping) — only exercised transitively through the integration test's assertions on tier selection, not on exact score values.

**Minimum test matrix recommended before calling the engine reliable:**
1. Unit: `buildEndpointCandidate` scoring math (fixed inputs → exact expected score), direction-rejection cases (#5, #6) as isolated pure-function tests rather than only via the heavier integration fixture.
2. Unit: `projectPointOntoRoute` direction-ordering and degenerate-route cases explicitly (confirm coverage in the existing `polyline.test.ts` rather than assuming).
3. Integration: extend the existing 5-fixture test with the two `pickupViable`/`dropoffViable`-mismatch cases (#10) and a genuine reverse-direction-on-a-real-route case.
4. Load: a synthetic-data benchmark at 1k/10k/100k in-window rides (the concrete benchmark named in §4), run once before any spatial-index migration to establish a real baseline.

**Recommended synthetic dataset shape** (not built here, per the audit's own no-implementation rule): a fixed set of ~15-20 real Tunisia road-network routes (reusing the existing integration test's real-OSRM discipline) spanning urban/suburban/intercity, each with driver-selected stops; a matrix of rider searches against each, with hand-verified expected `{tier, matchType, pickupViable, dropoffViable}` per (route, search) pair, plus expected rejection reasons for the deliberately-non-matching pairs (reverse direction, extension-beyond-endpoint, wrong-time) and an expected ranking order for the multi-candidate cases.

---

## 14. Marketplace learning loop

**FACT: VAYA does not currently record a search→booking funnel.** What exists:
- `bookings.status` transitions (pending→accepted/declined, cancelled) are real, durable state (Phase 1/10).
- `ratings` (Phase 9) captures post-trip outcome.
- **Search itself is not logged anywhere** — `GET /matching/search` has no server-side event recording (`matching.routes.ts` only calls `searchRides` and returns; no analytics/logging call). Mobile's `trackEvent` is a `console.log`-only stub not even wired into `search/results.tsx` (confirmed by grep — `results.tsx` is not among the 11 files calling `trackEvent`).

**Missing events, specifically, in funnel order:**

| Event | Exists? |
|---|---|
| `search` (query issued) | No |
| `impression` (candidate shown in results list) | No |
| `click` (candidate opened) | No — `useOpenDriver` navigates but doesn't log |
| `booking_request` | Implicit via `bookings` row creation — real, but not tied back to the search/impression that produced it |
| `driver_response` (accept/decline) | Implicit via `bookings.status` — real |
| `cancelled` | Implicit via `bookings.status`/`trips` — real |
| `completed` | Implicit via `trips.status` — real |

**Why this matters:** without `search`/`impression`/`click` events linked to the eventual booking outcome, VAYA cannot compute even a basic heuristic "this ranking signal correlates with acceptance" statistic, let alone train an ML ranker. The *outcome* half of the funnel (accept/decline/cancel/complete) already exists in durable state; the *discovery* half (what was shown, what was clicked) does not exist at all.

**When should VAYA move from deterministic → heuristic → ML?**
- **Now: deterministic hard filters + heuristic scoring** (current state, correctly chosen — §5F).
- **Next trigger for richer heuristics** (not ML): once reliability/cancellation signals are wired into the score (§8, a cheap change using data that already exists), that's still heuristic, not ML — appropriate as soon as it's built, no data-volume trigger needed.
- **ML trigger:** only after (1) a real search/impression/click event pipeline has been running long enough to accumulate a meaningful labeled dataset across many searches and many drivers, and (2) heuristic ranking has been observed to plateau or under-perform on some measurable dimension. Given VAYA has zero event pipeline today, this is not a near-term milestone — consistent with the audit's instruction not to recommend ML preemptively.

---

## 15. Final verdict

### Current maturity score (0-10, evidence-based)

| Dimension | Score | Evidence |
|---|---|---|
| Match correctness | 7 | Direction validation, seat/status/time hard filters, and the endpoint-comparison logic are all genuinely correct (§2, §12's 15/25 clean passes); loses points for the unused `routeOverlapPercent` discrepancy (§8) and silently-excluded (not flagged) passthrough non-viable cases |
| Partial-route intelligence | 6 | Real, working, tested end-to-end (`route_passthrough` tier) — but positioned as tier 3 of 4 (a fallback), not a first-class candidate-generation input, and has no Boost-style detour extension |
| Geographic intelligence | 5 | Correct haversine + polyline-projection math, but entirely application-level with no spatial index/database support — correct today, structurally limited at scale |
| Temporal intelligence | 5 | Solid fixed-window tiering and a genuinely useful `closest_departure` fallback; no rider/driver flexibility parameters at all |
| Detour intelligence | 2 | Real detour math exists (`stop-candidates.service.ts`) but is never invoked at search time for a specific rider — the single most-cited gap across §5, §7, §9, §12 |
| Ranking quality | 4 | Deterministic and sane, but omits already-computed `routeOverlapPercent` and already-stored reliability/cancellation signals from the actual score |
| Performance | 5 (today) / declining without action | Correctly indexed for its one SQL filter; the pure-app-level geographic/route work is fine at current inventory, ESTIMATE-labeled concern at 10k+ (§4) |
| Scalability | 6 | Explicitly, honestly staged (NOW/NEXT/SCALE, `docs/architecture/overview.md`) rather than either over- or under-built — a real strength of process, even though the underlying capability (PostGIS) doesn't exist yet |
| Reliability (of the search feature itself) | 7 | Graceful OSRM-failure degradation everywhere, no fabricated data, tier cascade guarantees "never silently empty while data exists" |
| Observability | 3 | Generic structured logging exists; nothing matching-specific (latency/error tracking on this endpoint), consistent with `docs/architecture/overview.md`'s own admitted NEXT-horizon gap |
| Testing | 6 | Real integration coverage against real Postgres+OSRM (a genuine strength relative to typical codebases at this stage), but thin on isolated unit coverage of the scoring formula itself and no load/perf tests |
| ML readiness | 1 | No event pipeline at all (`analytics.ts` is an explicit stub); correctly not attempted yet, but genuinely far from ready |

### Five most dangerous weaknesses

1. **No spatial database layer at all** — every geographic/route computation happens in application memory after a non-spatial fetch; this is the one gap that, left alone, eventually caps how large VAYA's ride inventory can grow before search latency degrades (§3, §4).
2. **No detour calculation at search time** — the single feature most responsible for BlaBlaCar's described "picks you up along the way" value proposition (Boost) has no equivalent; VAYA can only match a rider to a stop the driver already happened to select (§5B/§5C, §12 scenarios 7-10, 13).
3. **Reliability/cancellation/rating signals are stored but unused in ranking** — a cheap, already-available improvement sitting unbuilt (§6, §8).
4. **Zero search-funnel analytics** — VAYA cannot today answer "did this ranking produce good outcomes," which blocks every future ranking improvement, deterministic or ML (§14).
5. **Redundant per-tier DB fetching** — up to 6 sequential round-trips for a single "nothing found nearby" search, the exact case where a rider is already having the worst experience (§1.1, §4).

### Biggest architectural risk

**The absence of a spatial pre-filter before expensive route-geometry computation.** Every other gap in this report is additive (new signal, new tier, new event) — this one is structural: `scorePassThroughCandidates` runs full polyline decode+resample+projection against *every* time-windowed ride regardless of whether it's plausible, with no bounding-box or spatial-index step to shrink that set first. This is exactly the concept BlaBlaCar's publicly documented "cheap PostGIS pass, then expensive routing pass" architecture exists to prevent, and it's the one item this report can't call "fine for now, revisit later" without qualification — it should be the first thing addressed once real search volume starts appearing on the `route_passthrough`/`closest_departure` tiers, since those are precisely the tiers with no bound today.

### Biggest product risk

**A rider whose trip is a genuine short detour from an existing driver's route, but the driver never happened to select a stop there, gets no match at all — and no signal that a match was "almost" possible.** This is the concrete way a user concludes "Vaya doesn't find good rides": not because the engine is wrong when it does match, but because the matching surface (driver-selected stops only) is narrower than the real supply of usable rides on the road, and today's UI has no way to say "a driver is passing 1.2 km from you, would you like to request a stop there" (§5C, §12 #7-9).

### Highest-leverage improvement

**Build search-time detour calculation (`DETOUR_MATCH`), scoped to real driver-approved routes only, gated by a bounded detour tolerance mirroring `stop-candidates.service.ts`'s existing 300m/120s thresholds.** This directly closes the biggest product risk above, reuses the OSRM infrastructure and detour-scoring conventions that already exist for driver-side stop generation (no new external dependency, no new geometric primitive beyond what `lib/polyline.ts` already provides), and is the single change most aligned with the publicly documented BlaBlaCar mechanic this audit was asked to benchmark against.

### Cheapest validation

**Instrument `search/results.tsx` (mobile) to fire a real `search`/`impression`/`click` event through the existing `trackEvent` hook (already wired into 11 other files, just not this one) before building anything new in the matching engine itself.** This costs almost nothing (the hook exists, `results.tsx` just never calls it), requires no backend/schema change to start, and is the prerequisite for validating *any* future ranking change — including whether reliability-weighted ranking (§6, §8) or a `DETOUR_MATCH` tier actually improves outcomes, rather than assuming it does. Cheapest possible proof for the matching model's core hypothesis: log real search→click behavior for even a few weeks before investing further engineering in ranking sophistication.

---

## 16. Implementation roadmap (recommendations only — not implemented in this audit)

### P0 — Correctness blockers

| # | Problem | Current | Proposed | Files | DB changes | API changes | Tests | Benefit | Complexity | Dependencies | Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P0.1 | `routeOverlapPercent` is computed but never enters the `score` formula for endpoint tiers | `matching.service.ts:244-255` computes it, `score` ignores it | Add a small weighted term for `routeOverlapPercent` in `buildEndpointCandidate`'s score | `matching.service.ts` | None | None (internal scoring only) | Update `matching.service.test.ts` with a fixed-input score assertion | More accurate ranking, no behavior surprise (already displayed to users, just not acted on) | Low | None | Low — purely additive to an existing formula |
| P0.2 | `route_passthrough` silently excludes non-viable candidates instead of surfacing them (asymmetric with endpoint tiers' honest `pickupViable:false`) | `matching.service.ts:384-387` | Decide deliberately: either document this asymmetry as intentional (it currently is, per the code comment) or align behavior with endpoint tiers | `matching.service.ts` | None | Possibly `MatchCandidate` shape unchanged | Add a test asserting the deliberate choice | Consistency, or at minimum an explicit, reviewed decision rather than an incidental one | Low | Product decision needed first | Low |

### P1 — World-class deterministic matching

| # | Problem | Current | Proposed | Files | DB changes | API changes | Tests | Benefit | Complexity | Dependencies | Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P1.1 | No search-time detour calculation (`DETOUR_MATCH`) | Detour only computed at ride-publish time | New tier: for rides whose route passes within a bounded distance (e.g. 1-2 km) of the rider but has no existing viable stop, compute a real OSRM detour cost and gate on `MAX_DEVIATION_METERS`/`MAX_DEVIATION_SECONDS`-equivalent bounds, mirroring `stop-candidates.service.ts`'s existing constants | `matching.service.ts`, reuses `lib/routing.ts`, `lib/polyline.ts` | None (uses existing `route_stops`/`rides` schema) | `MatchCandidate` gains `matchType: 'detour'`, a `detourMeters`/`detourSeconds` pair | Unit (qualification logic), integration (real OSRM detour case) | Closes the single biggest product risk (§15) | Medium-High (needs a bounded, careful detour formula and a decision on whether a detour match creates a new provisional stop or just flags feasibility) | OSRM detour calls per-candidate — must be scoped to an already-narrow candidate set (P2.1) first, or it reintroduces N-routing-calls risk | Medium — must not regress the "never call OSRM per-candidate unboundedly" discipline this codebase currently maintains |
| P1.2 | No `EXTENDED_ROUTE_MATCH` (endpoint extension) | Not modeled at all | Lower priority than P1.1 — evaluate product demand before building; if pursued, mirrors P1.1's detour mechanism applied to route termini rather than mid-route points | `matching.service.ts` | None | New `matchType` | New unit/integration cases | Closes §2/§7/§12#4's gap | Medium | P1.1's detour infrastructure | Low-Medium |
| P1.3 | Reliability/cancellation/rating signals stored but unused in ranking | `driver_profiles.reliabilityScore` etc. exist, `score` ignores them | Add capped-weight terms to the scoring formula (both endpoint and passthrough) | `matching.service.ts` | None | None | Unit tests with fixed inputs | Directly closes weakness #3 (§15) | Low | None | Low |
| P1.4 | Redundant per-tier DB fetching (up to 6 round-trips) | `fetchPublishedRidesInWindow`/`fetchStopsByRide` re-run per tier | Fetch once at the widest window (`WIDE_TIME_WINDOW_MIN` ∪ 14-day lookahead's near-term slice), filter tighter tiers in memory from that single result set | `matching.service.ts` | None | None (internal only) | Existing integration test should still pass unchanged; add a query-count assertion if feasible | Cuts worst-case latency exactly where it's most needed (sparse corridors) | Medium (careful not to change tier semantics — closest_departure's 14-day window is much wider than the others, may need to stay a separate fetch) | None | Medium — must preserve exact current tier-selection behavior, verified by the existing integration test |

### P2 — Performance/scalability

| # | Problem | Current | Proposed | Files | DB changes | API changes | Tests | Benefit | Complexity | Dependencies | Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P2.1 | No spatial pre-filter before expensive polyline projection | `scorePassThroughCandidates` runs full projection against every time-windowed ride | Near-term (pre-PostGIS): add a cheap bounding-box filter (lat/lng range check) in the `WHERE` clause or immediately after fetch, before polyline decode; longer-term: PostGIS + GiST per the already-documented NEXT/SCALE plan | `matching.service.ts`, eventually `rides.schema.ts`/migrations | Near-term: none. Long-term: `geography` columns + GiST index (already scoped in `docs/architecture/overview.md:85,91` — not a new recommendation, just reinforcing the existing plan's priority) | None for near-term; API-transparent | Load test at 1k/10k synthetic rides (the benchmark named in §4) | Directly addresses the single biggest architectural risk (§15) | Low (near-term bbox filter) / High (PostGIS migration) | PostGIS step depends on the NEXT-horizon trigger (`docs/architecture/overview.md:85`) actually being observed — **do not start the PostGIS migration without that measured trigger**, per CLAUDE.md's explicit instruction | Low (bbox) / Medium (PostGIS migration, schema risk on a live table) |
| P2.2 | `closest_departure`'s 14-day lookahead has no DB-side `LIMIT` before app-level `.slice(0, 5)` | `findClosestDepartures` (`matching.service.ts:456-496`) | Push `ORDER BY ABS(departure_at - :when) LIMIT :n` into SQL instead of fetching the full 14-day window | `matching.service.ts` | None (query rewrite only) | None | Integration test already asserts ordering — extend to assert row-count efficiency if feasible | Removes the single largest unbounded-fetch risk identified in §4 | Low-Medium | None | Low |
| P2.3 | No caching of computed search/tier results | Every search fully recomputes | Consider a short-TTL cache keyed by rounded (origin, destination, time-bucket) for the `exact`/`wide_corridor` tiers only (not `route_passthrough`/`closest_departure`, which are more sensitive to seat-count changes) | `matching.service.ts`, `lib/cache.ts` | None | None | Cache-hit/miss test | Reduces load under repeated identical searches (common — many riders searching the same popular corridor) | Medium (cache invalidation on booking/seat changes needs care — a stale "seats available" is a correctness risk, not just a staleness annoyance) | None | Medium — must not let a cached search show a ride that just filled up |

### P3 — Ranking intelligence

| # | Problem | Current | Proposed | Files | DB changes | API changes | Tests | Benefit | Complexity | Dependencies | Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P3.1 | Explainability is a fixed string set, not quantified | `buildReasons`/`TIER_MESSAGES` | Return the already-computed numeric signals (`routeOverlapPercent`, `pickupWalkMinutes`, new `dropoffWalkMinutes`, `timeDeltaMin`) as first-class response fields; let the client render richer explanations from real numbers | `matching.service.ts`, `matching.routes.ts` (schema), mobile `results.tsx` | None | Additive fields on `MatchCandidate` (backward-compatible) | Schema/contract test | Directly closes §11's gap, improves trust (CLAUDE.md product principle #2) | Low-Medium | None | Low |
| P3.2 | No result diversification | Pure score sort | Cap consecutive same-driver results, or apply a small diversity re-rank pass once inventory density makes it relevant | `matching.service.ts` | None | None | Unit test with a synthetic multi-ride-same-driver fixture | Prevents one prolific driver from crowding results | Low | Low current priority — inventory scale doesn't yet make this visible | Low |

### P4 — ML / marketplace optimization (explicitly gated on data existing first)

| # | Problem | Current | Proposed | Files | DB changes | API changes | Tests | Benefit | Complexity | Dependencies | Risk |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P4.1 | No search-funnel analytics | `analytics.ts` stub, unused in `results.tsx` | Wire real `trackEvent` calls for `search`, `impression` (per card rendered), `click` (per `useOpenDriver` invocation) — still just logging, no ranking change yet | `apps/mobile/app/search/results.tsx`, `src/features/search/useOpenDriver.ts` | None | None (client-only event emission; sink can stay the dev-console stub initially) | Smoke test confirming events fire | **This is the cheapest validation named in §15** — prerequisite for everything below | Low | None | Low |
| P4.2 | No real event sink/warehouse | Dev-console only | Stand up a first-party lightweight ingest endpoint (per `docs/architecture/overview.md:87`'s own NEXT-horizon plan — not a new recommendation) once P4.1's events exist and need a real destination | New `apps/api` module | New `search_events`-style table | New ingest endpoint | Integration test | Enables aggregate acceptance-rate computation | Medium | P4.1 | Low |
| P4.3 | ML ranking | Not attempted | Do not build until P4.1+P4.2 have produced a real, sufficiently large labeled dataset and heuristic ranking (P1.3) has been running long enough to show its own ceiling | — | — | — | — | — | High | P4.1, P4.2, meaningful production traffic | High if attempted prematurely — explicitly not recommended now |

---

# EXECUTIVE DECISION

1. **Is Vaya's current search engine fundamentally sound?** Yes. The hard filters (seats, status, time, direction) are all correctly implemented and verified by a real integration test against real Postgres and real OSRM. The tiered fallback design (exact → wide → passthrough → closest → none) is a genuinely good, honestly-labeled architecture that already reflects the right instinct ("show something, not nothing"). The foundation — real OSRM routing, real polylines, real driver-curated stops — is not a prototype; it is production-shaped infrastructure the rest of this roadmap builds on, not replaces.

2. **Can it correctly handle partial routes today?** Yes, for the specific case where the driver has already selected real stops near both the rider's origin and destination — proven end-to-end by `matching-tiers.integration.test.ts`'s `route_passthrough` fixture against a real Tunis→Sousse OSRM route. It cannot handle the case where a partial-route match exists geometrically but the driver never happened to select a stop there (no live detour/Boost mechanism), and it cannot handle extension beyond a driver's published endpoint.

3. **What is the biggest correctness problem?** There is no single correctness *bug* of consequence — the closest thing is the `routeOverlapPercent`-computed-but-unused-in-scoring discrepancy (P0.1), which is minor. The far bigger issue is a **completeness** gap, not a correctness one: real, bookable rides that pass near a rider but require a small, uncalculated detour are invisible to search today, not because the engine computes them wrong, but because it never attempts the computation at all.

4. **What must be rebuilt vs. improved?** Nothing must be rebuilt. Every P0-P3 recommendation in §16 is additive to the existing `matching.service.ts`/`lib/polyline.ts`/`lib/routing.ts` foundation. The one item that eventually requires a real schema migration (not a rebuild, an addition) is PostGIS geography columns + GiST indexes (P2.1's long-term half) — and per this codebase's own documented, deliberate NOW/NEXT/SCALE strategy, that migration should not start until a measured latency/load trigger is actually observed, not on this audit's say-so alone.

5. **What should I do FIRST before writing more search code?** Wire real `search`/`impression`/`click` analytics events into `search/results.tsx` (P4.1) — it costs almost nothing (the `trackEvent` hook already exists and is wired into 11 other files, just not this one), and it is the only way to actually validate whether any of this report's other recommendations — reliability-weighted ranking, a `DETOUR_MATCH` tier, result diversification — produce better outcomes rather than just theoretically-better-sounding ones. Every subsequent ranking investment should be justified against real click/booking data this one change would start producing immediately.
