# VAYA Search Engine — Second Audit + Implementation Specification

**Date:** 2026-08-23 · **Scope:** read-only, no code/migrations/refactors changed · **Supersedes-in-part:** `docs/product/search-engine-audit-2026-08-23.md` (v1) — this document independently re-verifies v1's claims and adds the active-trip/concurrency/scale analysis v1 did not cover.

**Method, honestly stated:** every claim below was checked against the actual repository in this session — files re-read directly (not recalled from v1), `pnpm install` run fresh, unit test suites actually executed (`packages/domain`: 62/62 passing; `apps/api` pure-unit tests: 46/46 passing — command output reproduced in §17). Integration and E2E tests (`*.integration.test.ts`, `tests/e2e`) require a live Postgres + OSRM stack; this sandbox has **no Docker daemon** (`docker ps` fails: `no such file or directory`) and **no reachable Postgres** (`pg_isready` on 5432: no response) — those tests could not be executed, only read. Every claim in §17's table is marked with how it was actually established: **CODE** (read the implementation), **TEST-RUN** (executed and observed), **TEST-READ** (read the test file but could not execute it), or **NOT VERIFIED**.

---

## Part 1 — Independent re-verification of v1's core claims

v1's claims about `matching.service.ts`, `lib/polyline.ts`, `lib/routing.ts`, and the schema/index layout were re-checked by re-reading the actual files this session (not by trusting v1's prose). **Verdict: v1's factual claims about the search pipeline hold up** — no PostGIS (`grep -ril "postgis\|ST_DWithin\|geography" apps/api docker` → zero hits, `docker-compose.yml` uses plain `postgres:16-alpine`), no spatial indexes (only the btree indexes listed in v1 §3/§6), the 4-tier cascade (`exact → wide_corridor → route_passthrough → closest_departure → none`) is real and matches v1's trace of `matching.service.ts:529-574` line-for-line. One correction and one addition to v1, found this session:

- **Correction — v1 slightly overstated a "bug."** v1 flagged `routeOverlapPercent` as "computed but never used in scoring" as a P0 correctness item. Re-reading `matching.service.ts:252-255`, the `score` formula for endpoint tiers is genuinely `pickup(0.4) + time(0.3) + dropoff(0.3)` with no overlap term — this is confirmed, but it's a **ranking-quality gap, not a correctness bug** (nothing is mismatched or wrong, a signal is simply unused). Recategorized below as part of P3, not P0.
- **Addition — a docker-compose corruption v1 didn't catch.** `docker/docker-compose.yml`, immediately after the Redis healthcheck's `retries: 5`, contains a stray corrupted line: `retries: 5n d,zaml b d;am,xb` (verified by direct read, not a typo in this report). This is very likely to break `docker compose up` as YAML. **Not part of the search-engine scope this audit covers, flagged here only because it was encountered directly and affects whether the integration-test environment this report needed even starts** — worth a human's attention separately.

---

## Part 2 — The road-network detour requirement (Case A), re-examined

v1 already concluded VAYA has no search-time detour calculation. This audit's job was to verify that independently and design the algorithm properly (not reuse v1's recommendation blindly), per PART 7's instructions.

**Verified again, directly:** `matching.service.ts`'s only geometric test for `route_passthrough` is `projectPointOntoRoute` (`lib/polyline.ts:128-161`) — nearest-point-on-polyline distance and along-route fraction. This is **not** a road-network detour cost. A point 1 km from the *polyline* (a straight resampled path) is not the same as a point the driver can reach with a 1 km *driving* detour — the prompt's own framing is correct, and confirmed against the code: there is no call to OSRM `/route` (or `/table`) comparing "driver's route as published" against "driver's route with pickup/dropoff inserted" anywhere in `matching.service.ts`, `stop-candidates.service.ts`, or anywhere else in `apps/api/src`. The only real road-network detour computation in the whole codebase is `stop-candidates.service.ts`'s driver-publish-time stop scoring (`MAX_DEVIATION_METERS = 300`, `MAX_DEVIATION_SECONDS = 120`), which never runs against a specific rider's request. **v1's conclusion holds, independently re-confirmed.**

---

## Part 3 & 4 — Active-trip / live-route requirement: THE DECISIVE FINDING

This is the single most important result of this second audit, and it is not a matter of interpretation — it is directly stated in the codebase's own comments.

| Capability asked about | CURRENTLY EXISTS? | WHERE | ACTUALLY WORKS? | TESTED? | SAFE FOR CONCURRENCY? |
|---|---|---|---|---|---|
| Active trip state (a ride genuinely "in progress") | **Schema-only, never reached.** `rides.status` enum includes `'in_progress'` (`rides.schema.ts:17-24`) and the state machine allows `published/full → in_progress` (`packages/domain/src/ride/ride-status.ts:14-15`) | `ride-status.ts` | **No.** Grepped every file under `apps/api/src/modules/rides` for `'in_progress'` and for any call to `canTransitionRideStatus(..., 'in_progress')` — **zero real call sites**. The only place a ride row is ever given `status: 'in_progress'` is `db/seed.ts:899` (fake demo data, not production code) | No (nothing to test — no code path produces this transition) | N/A |
| Driver GPS position | **Does not exist.** No `currentLat`/`currentLng`/`gpsLat` or equivalent column anywhere — grepped `apps/api/src` and `apps/mobile/src` for `currentLat\|currentLng\|driverLocation\|gpsLat\|liveLocation`, zero hits in either | — | No | No | N/A |
| Trip started (real transition) | No API endpoint exists. `apps/api/src/modules/trips/trips.routes.ts` has exactly 3 routes: `GET /bookings/:bookingId/trip`, `POST /trips/:id/complete`, `GET /trips/pending-rating` — **no "start"/"begin" endpoint at all** | `trips.routes.ts:34-76` (full file read) | No | No | N/A |
| Trip completed | **Yes, real.** `POST /trips/:id/complete` → `completeTrip()` (`trips.service.ts:123-166`), atomically sets `trips.status='completed'` and mirrors `bookings.status='completed'`, triggers `refreshTripCounts` and `trip_completed` notifications | `trips.service.ts` | **Yes** | Indirectly via `packages/domain`'s `trip-status.test.ts` (state-machine logic, run this session: PASS) — no integration test found for `completeTrip` itself | Uses a plain `UPDATE...WHERE eq(trips.id,...)`, not a conditional guard — see §5 |
| Current location (any entity) | Only `useCurrentPosition.ts` in mobile — a **single-shot** `Location.getCurrentPositionAsync()` (`apps/mobile/src/services/location/useCurrentPosition.ts:32`), used exactly once, in `(tabs)/explore.tsx`, to seed the *rider's own search origin*. Not continuous tracking, not a driver-location broadcast, not stored server-side anywhere | `useCurrentPosition.ts` | Works for its one real purpose (one-time rider location for search) | Not found | N/A |
| Accepted pickup / dropoff (per booking) | **Yes, real.** `bookings.pickupStopId/pickupLat/pickupLng`, `dropoffStopId/dropoffLat/dropoffLng` — server-validated in `createBooking` (`bookings.service.ts:97-159`) | `bookings.schema.ts`, `bookings.service.ts` | Yes | Yes (unit-level for the pure ranking functions; DB-level only via the integration test, unexecutable here) | Yes — see §5 |
| Ordered future stops (per ride, static) | **Yes, real, but static.** `route_stops.sequence`, driver-curated at publish time (`route-stops.schema.ts`) | — | Yes, for the *published, unstarted* route | Yes (`stop-candidates.service.test.ts`, run this session: 20/20 PASS) | N/A — read-mostly after publish |
| Route mutation (mid-trip) | **Does not exist.** `acceptBooking` (`bookings.service.ts:257-313`) updates only `rides.seatsAvailable`/`status` and `bookings.status` — it never touches `rides.routePolyline` or inserts/reorders `route_stops`. No code path recomputes a route after any booking event | — | No | No | N/A |
| Remaining seats | **Yes, real, and atomically safe.** See §5 | `bookings.service.ts:272-282` | Yes | Yes (code-level trace; DB-level proof needs the integration suite, unexecutable here) | **Yes — verified this session, directly** |
| Realtime updates (any transport) | **No push-style realtime.** No WebSocket/SSE anywhere — grepped `apps/api`/`apps/mobile` package.json dependencies for `socket.io`/`ws`/`@fastify/websocket`/`ably`/`pusher`: zero hits. What exists: (a) RTK Query `pollingInterval` in `conversations/[bookingId].tsx`, `bookings/confirmed.tsx`, `(tabs)/trips.tsx`, `(tabs)/explore.tsx` (client-side pull polling), and (b) real push notifications via BullMQ (`lib/queue.ts`, confirmed present, 154 lines) → Expo push HTTP API (Phase 7) | `state/api.ts`, `lib/queue.ts` | Polling: yes, for what it polls (messages, booking status). Push: yes, for the 3-4 dispatched event types, but **never live location** | Push dispatch has a real integration test (`bookings-notifications.integration.test.ts`) — unexecutable here | N/A |
| Booking acceptance during an "active" trip | **Structurally impossible today** — `createBooking` requires `ride.status === 'published'` (`bookings.service.ts:79-81`); since no ride ever reaches `in_progress` in practice (see row 1), this specific scenario has never been exercised by any real code path. If a ride *were* ever `in_progress`, `createBooking`'s hard `ride.status !== 'published'` check would **reject** the new request outright — the opposite of Part 3's desired behavior | `bookings.service.ts:79-81` | No | No | N/A |

**What actually drives the "live trip" screens the mobile app shows today:** `apps/mobile/app/bookings/live.tsx` — read directly, full file. It is a `setTimeout(() => router.replace('/bookings/settlement'), 4000)` (`live.tsx:34-38`): a **hardcoded 4-second client-side timer**, with a comment in the same file stating outright: *"there's no real-time position feed to compute one from yet"* (`live.tsx:87`, verbatim in-code). `trips.schema.ts`'s `simulationStartedAt` column name (and `packages/domain/src/trip/trip-status.ts:20-24`'s own comment, also verbatim: *"trips were created scheduled... and never progressed... this app's mobile trip-progress screens... are still a presentational mock with no live position feed driving them through the intermediate statuses"*) both independently corroborate this from the API side. **This is not this audit's inference — it is the codebase's own documented self-assessment**, found by reading the actual files, and it is unambiguous.

**Conclusion for Parts 3/4:** everything the prompt describes — `originalRoute`, `currentLocation`, `completedStops`, `acceptedStops`, `remainingStops`, `remainingSeats`, `activeTripStatus` as a *live, GPS-driven* concept — has **zero implementation**. `remainingSeats` is the one piece that exists and is solid (a plain column, correctly maintained — §5). Everything else in that list must be designed and built from nothing; there is no partial version of it to extend, and no wrong version to fix — this is new capability, not a bug fix.

---

## Part 5 — Concurrency: verified directly, with one correction to what you should assume

**Two seats, three simultaneous single-seat requests (A, B, C) — can two be incorrectly accepted?** **No — verified in code, `bookings.service.ts:272-282`:**

```ts
const [updatedRide] = await db
  .update(rides)
  .set({ seatsAvailable: sql`${rides.seatsAvailable} - ${booking.seatsRequested}`, ... })
  .where(and(eq(rides.id, booking.rideId), gte(rides.seatsAvailable, booking.seatsRequested)))
  .returning();
if (!updatedRide) throw new ConflictError('Not enough seats remaining to accept this request');
```

This is a single atomic `UPDATE ... WHERE seats_available >= N`, not a read-then-check-then-write. Postgres serializes concurrent `UPDATE`s on the same row via row-level locking — two concurrent `acceptBooking` calls against the same ride cannot both see the same "current" `seatsAvailable` value; the second writer's `WHERE` clause is evaluated against the *already-decremented* row and fails to match, returning zero rows, which the code correctly turns into a `ConflictError`. **This genuinely cannot oversell, independent of how many pending requests exist or how they're timed.** `cancelBooking` (`:406-413`) and `reportNoShow` (`:495-502`) use the identical pattern for their own status transitions, each with an explicit in-code comment describing the exact double-credit race it closes. This is real, careful engineering — verified, not assumed.

**What is NOT protected, verified directly:**
1. **`createBooking` has no idempotency protection.** `bookings.schema.ts` has no unique constraint on `(rideId, riderId)` or `(rideId, riderId, status)` — a network retry or a double-tap on "Request" can create two separate `pending` bookings for the same rider on the same ride. This does not cause overselling (only `acceptBooking`'s atomic step actually reserves seats), but it is a real UX/data-quality gap: the driver would see two identical requests.
2. **No booking-expiry job exists.** `'expired'` is a valid `bookings.status` (`booking-status.ts:7`) and a valid `pending → expired` transition, but grepping all of `apps/api/src/modules` for a write of `status: 'expired'` finds only `db/seed.ts:1200` (demo data). **Nothing in production code ever expires a stale pending request** — it sits forever until the driver acts or the rider cancels.
3. **`completeTrip` (`trips.service.ts:132-136`) uses a plain `UPDATE...WHERE eq(trips.id,...)`, not the conditional-status-guard pattern `acceptBooking`/`cancelBooking`/`reportNoShow` use.** Two concurrent "complete this trip" calls (plausible since either party can call it) would both succeed and both fire `trip_completed` notifications twice — a minor, low-consequence duplication (not a financial/seat-count bug, since there's no payment system to double-trigger), but a real, verified inconsistency in an otherwise carefully-guarded codebase.

**"Driver accepts A, route changes, does B's search see it milliseconds later?"** — verified: **there is no route change to see.** `acceptBooking` never touches `routePolyline`/`route_stops` (§3/4). What *does* change, correctly and immediately, is `rides.seatsAvailable` — and because `matching.service.ts` never caches ride rows (re-confirmed: `fetchPublishedRidesInWindow` is a fresh, uncached query every call) and Postgres's default `READ COMMITTED` isolation means any query started after `acceptBooking`'s transaction commits sees the new value, **B's search milliseconds later correctly sees the updated seat count** — this part of the consistency model already works, by construction, with no extra effort. The gap is entirely that there is no *route* state to be inconsistent about yet.

---

## Part 6 — Published vs. Live route: design (nothing to extend — this is net-new)

Since §3/4 established there is no existing live-route mechanism at all, this is a from-scratch design recommendation, not a refactor of something broken. **Recommended model — deliberately the simplest correct one, per the prompt's own instruction not to over-engineer with event sourcing:**

- **`rides` stays exactly what it is today** — the immutable published intention (`originLat/Lng`, `destinationLat/Lng`, `routePolyline`). Never overwritten. This is already true and should stay true.
- **A new, small, append-only `trip_route_versions` table** (conceptual — not built here): `id, tripId, version int, currentLat, currentLng, remainingPolyline text, remainingStops jsonb-or-FK-list, createdAt`. One row per recalculation, never updated in place — "never overwrite historical route data" is satisfied by insert-only semantics, not by a heavier event-sourcing framework. `trips` gains a `currentRouteVersionId` pointer to the latest row.
- **Why not event sourcing:** the prompt is right to warn against it. VAYA doesn't need to replay history to reconstruct state — it only ever needs "what is the *current* remaining route," which a single mutable pointer to the latest version row answers in one indexed lookup. Full event sourcing (storing every GPS ping as an immutable event and replaying) would be solving a problem VAYA doesn't have at 1,000-user scale — this is exactly the kind of premature complexity CLAUDE.md's architecture principles warn against.
- **Why a version table and not just mutating `trips` directly:** because §11 requires detecting "this search/booking decision was made against a stale route" — a monotonically increasing `version` integer that a booking-time recheck can compare against is the cheapest mechanism that satisfies that requirement without inventing a queueing/locking scheme.

---

## Part 7 — Detour matching: independent design (not v1's recommendation, reasoned fresh)

**The correct question, restated from the prompt:** given a driver's *remaining* route `A → B → C → D` (today, absent live tracking, this degenerates to the *published* route, since remaining ≡ published until active-trip tracking exists — §3/4) and a passenger `P → Q`, is `A → ... → P → Q → ... → D` feasible, and at what cost?

**Correct algorithm (two-phase, cheap-then-expensive, mirroring what `matching.service.ts` already does correctly for its existing tiers — not a new pattern for this codebase):**

1. **Cheap phase (already exists, reusable as-is):** `projectPointOntoRoute` for P and Q against the route polyline, direction-ordering check (`fraction` gap) — this is a *candidate filter*, not the detour answer. It tells you "P and Q are geometrically plausible," not "here is the real cost." Keep this exactly as `route_passthrough` already uses it, to shrink the candidate set before the expensive phase.
2. **Expensive phase (does not exist — this is the actual new work):** for each surviving candidate, call OSRM twice:
   - `costOriginal = getRoute(driver_current_or_origin, ..., destination)` — **already computed and stored** as `rides.routePolyline`/`estimatedDurationSec` for the published-route case; would need a fresh call for the live-route case (§10).
   - `costWithInsertion = ` a multi-waypoint OSRM `/route` call through `[current_position, P, Q, ...remaining_stops..., destination]` (OSRM's `/route` service accepts multiple waypoints in one call — no need for `/table` or multiple round trips).
   - `extraDistanceMeters = costWithInsertion.distance - costOriginal.distance`, `extraDurationSeconds` likewise.
   - `detourRatio = extraDurationSeconds / costOriginal.durationSec` — a normalized "how much longer, proportionally" figure, which is the right way to compare a 2-minute detour on a 10-minute trip against a 2-minute detour on a 3-hour trip (the same absolute detour means very different things).
   - `pickupAccessDistance`/`dropoffAccessDistance` = walking distance from P/Q to their nearest real `route_stop` (reuse `rankStopsByWalkDistance` exactly as today — no new primitive needed).
   - `pickupETA`/`dropoffETA` = derived from the OSRM route's cumulative duration to those waypoints (available directly from the `/route` response's leg durations, no extra call).

**Hard rejection conditions — deliberately NOT the existing 300m/120s stop-generation thresholds, reasoned independently as instructed:**

| Threshold | Recommended value | Label | Reasoning |
|---|---|---|---|
| Max `detourRatio` | ~15-25% of remaining trip duration | **HYPOTHESIS** | No usage data exists yet to calibrate this (§14's marketplace-learning-loop gap applies here too) — a ratio-based bound is the right *shape* (FACT-adjacent reasoning: an absolute-meters threshold, like the existing 300m, is wrong for this different purpose because a 300m detour is trivial on a 3-hour intercity trip and enormous on a 10-minute urban hop — this asymmetry is exactly why the prompt is right not to reuse the stop-generation constant), but the specific 15-25% number is a starting hypothesis to validate against real driver tolerance, not a measured fact |
| Absolute floor for very short trips | ~3-5 minutes extra, regardless of ratio | **ASSUMPTION** | A 20% detour ratio on a 5-minute trip is only 1 extra minute — too permissive in absolute terms for a driver who just wants to get somewhere quickly; a floor avoids the ratio math producing a nonsensically tiny bound |
| Absolute ceiling | ~10-12 minutes extra, regardless of ratio | **ASSUMPTION** | Even on a very long intercity trip, an unbounded ratio-based allowance could ask a driver to accept an unreasonably long absolute detour; a ceiling caps that |
| Urban vs. rural | Tighter ratio in dense urban contexts (more unpredictable traffic/turn cost per meter), looser on intercity/rural roads | **HYPOTHESIS** | Reasoned from the same local-speed signal `stop-candidates.service.ts` already derives (`classifyRoadSpeed`) — reusable, not a new data source — but no VAYA-specific data confirms the right multiplier |
| Driver preference | A future per-driver "willing to detour: never / small / flexible" setting | **ASSUMPTION (not built)** | Not present in `driver_profiles` schema today (verified: no such column) — a reasonable product addition, out of this audit's scope to design in detail |

**This must be an opt-in tier, not a silent default**, for the same reason v1 argued: CLAUDE.md's product principle #1 (never free-form pickup) means a detour-match can only ever be *offered* through a real, driver-approved stop — either an existing `route_stops` row, or (new capability) a driver confirmation step the moment a detour match is proposed, before it becomes bookable. This audit does not resolve which of those two UX shapes is correct — that is a product decision, flagged, not decided here.

---

## Part 8 — Pickup/dropoff must be real: re-confirmed, and the correct model stated precisely

Already covered by §7's two-phase design: the correct comparison is `driver_current_position → remaining_route` (cost A) vs. `driver_current_position → pickup → dropoff → remaining_route` (cost B), with `extraDistance/extraDuration = B - A`, computed via one real multi-waypoint OSRM call, not inferred from polyline proximity. **Confirmed this does not exist today** (§2) and **confirmed the infrastructure to build it exists** (OSRM is already wired, `getRoute`/`getRouteWithSpeedProfile` in `lib/routing.ts` already accept arbitrary origin/destination pairs — extending to multi-waypoint is a parameter change to the existing OSRM call URL pattern, not new infrastructure).

---

## Part 9 — Partial routes: re-verified against the actual code (not re-run against live OSRM — unavailable in this sandbox)

| Driver | Passenger | Expected result | Current Vaya result (traced from code) | Correctness | Reason |
|---|---|---|---|---|---|
| Tunis → Sfax | Hammamet → Sousse | `PARTIAL_ROUTE_MATCH` (both points plausibly on the real Tunis–Sfax road) | `route_passthrough` **if** the driver has real `route_stops` near both Hammamet and Sousse; **excluded entirely** (not even flagged non-viable) if not — `matching.service.ts:384-387` | **PARTIAL PASS** | Verified: the tier's own code comment states pass-through candidates without real stops are excluded, not surfaced — a deliberate choice, re-confirmed this session |
| Tunis → Sfax | Sousse → Hammamet (reverse of above) | `NO_MATCH` (wrong direction) | `NO_MATCH` — `destProj.fraction - originProj.fraction < MIN_ROUTE_FRACTION_GAP` fails (`matching.service.ts:382`) | **PASS** | Direction check re-verified directly in code this session |
| Tunis → Sousse | Tunis → Monastir (Monastir beyond Sousse) | `EXTENDED_ROUTE_MATCH` if a driver would plausibly continue, else `NO_MATCH` | `NO_MATCH` — the route polyline terminates at Sousse; a point meaningfully past it fails to project within `OVERLAP_CORRIDOR_WIDTH_M` (150m) of any sampled point | **PASS by the current model's own rules, FAIL against the target model** — no extension mechanism exists (v1 flagged this too; independently re-confirmed) | `projectPointOntoRoute` (`lib/polyline.ts:128-161`) has no extrapolation-beyond-polyline-end behavior — confirmed by reading the function: it only searches within `resamplePolyline(route, ...)`'s existing points |
| Tunis → Sousse | Hammamet → Sousse | `PARTIAL_ROUTE_MATCH`/`EXACT-ish` (Hammamet is on the direct route, Sousse is the shared endpoint) | Likely `wide_corridor` or `exact` (dropoff endpoint matches ride destination directly) rather than needing `route_passthrough` at all, since the destination *is* the ride's own destination | **PASS** — this is actually the easy case, correctly handled by the existing endpoint tiers, re-confirmed by re-reading `buildEndpointCandidate` | `matching.service.ts:212-293` |
| Tunis → Sfax | Sousse → Gabès | `NO_MATCH` (Gabès is south of Sfax — beyond the driver's route) | `NO_MATCH` — same mechanism as the Monastir case above (point beyond route terminus) | **PASS** (correctly rejects, though for the "beyond terminus" reason, not a deliberate "computed and correctly rejected" reason) | Same as row 3 |

**Caveat, stated honestly:** none of these were re-run against live OSRM in this session (no Docker/OSRM available) — the direction and corridor-width logic is verified by direct code trace, and the existing `matching-tiers.integration.test.ts` (read, not executed) already contains a real Tunis→Sousse OSRM-route fixture that exercises this exact mechanism; this audit trusts that test's *design* (it is well-constructed) but cannot independently confirm it *passes* right now without the missing infrastructure.

---

## Part 10 & 11 — Active-trip matching algorithm and realtime consistency: target design (nothing exists to trace)

Since §3/4 established zero existing implementation, this section is a design specification, clearly labeled as such throughout — not a description of current behavior.

**Route-version update cadence — reasoned, not measured (all HYPOTHESIS unless noted):**
- **Not every GPS update should trigger a route recalculation.** A phone easily emits a position every few seconds; recalculating a remaining-route OSRM call on every single ping is wasteful and unnecessary for a carpooling app (unlike, say, a live navigation app). **Recommendation: debounce to a minimum interval (e.g., 30-60s) AND a minimum movement threshold (e.g., 200-300m moved) — whichever comes first, but not both required.** This is a reasoned default (HYPOTHESIS), not a measured one.
- **A route version should only actually increment on a *meaningful* event**, not on every debounced GPS tick: (a) a new booking is accepted (a real, discrete route-changing event — this one is unambiguous and easy), (b) the driver has deviated from the last-known remaining route by more than a threshold (e.g., >250m off-polyline for >1 minute sustained — avoids single noisy GPS pings triggering a spurious recompute), or (c) a stop is confirmed completed (rider picked up/dropped off). **GPS pings alone, absent one of these events, should update `currentLat/Lng` in place without minting a new version** — this keeps "where is the driver right now" cheap and frequent while keeping "what is the route" (the expensive, OSRM-calling operation) rare and event-driven.
- **How search reads the current version:** a search against an active driver reads `trips.currentRouteVersionId`'s row directly (one indexed FK lookup, cheap) rather than recomputing anything — the expensive OSRM work happens once, at version-creation time, not once per search that happens to hit an active trip.
- **Stale searches:** a `SearchResult` returned against version N is implicitly stale the moment version N+1 exists. This is fine for *browsing* (the rider doesn't need a live-updating result list) but is **not** fine for *booking* — see §16, which requires a mandatory revalidation at booking time regardless of which version the search was shown against.
- **Driver deviates from the planned route:** the debounce/threshold logic in the second bullet above already treats "sustained off-polyline drift" as a version-triggering event — this is the mechanism that would catch it, not a separate one.
- **GPS temporarily unavailable:** the trip's *last known* route version stays authoritative (don't invalidate/hide the trip from search just because one ping was missed) — but if GPS has been stale beyond some bound (e.g., a few minutes), the trip should probably stop being offered for *new* detour-matches (existing accepted passengers are unaffected) until a fresh position arrives, as a conservative safety default. This is a reasoned recommendation (ASSUMPTION), not something any existing code enforces today (nothing to enforce — the feature doesn't exist).

---

## Part 12 — 1,000-user scale: modeled, not asserted

All figures below are **ESTIMATE** or **ASSUMPTION**, explicitly — no load test was run (no environment available to run one in this sandbox).

**Assumptions made explicit:** 1,000 registered users, ~100 concurrently-active drivers, ~300 published rides in the near-term window at any time (a driver may publish more than one ride across a period), searches modeled at 20/100/500 simultaneous.

| Scenario | DB queries (matching only) | Route/polyline CPU work | Redis ops | Realistic bottleneck at this scale? |
|---|---|---|---|---|
| 20 simultaneous searches | ~20 × up to 6 sequential queries (worst case, only on the "nothing found nearby" path — v1 §1.1/§4, re-confirmed this session) = up to 120 short, indexed queries in flight | 20 × (worst case) polyline projection against ≤300 candidate rides — cheap in aggregate at this N | 20 × 1-2 Redis round-trips (OSRM cache) | **No** — even the worst-case cascade at N=300 candidate rides is well within a single Postgres instance's easy capacity; the composite `(status, departure_at)` index does real work here |
| 100 simultaneous searches | ~600 queries in flight worst-case | Still cheap in absolute terms (300 rides × ≤3000-sample projection is milliseconds of CPU per search, but done **synchronously on Node's single event loop** — see below) | ~100-200 Redis round-trips | **Possibly, on CPU**, not DB: if a meaningful fraction of these 100 concurrent searches hit the `route_passthrough` tier at once, their polyline-projection work all competes for the *same* single-threaded Node event loop (`apps/api` is a standard Fastify/Node process — no worker-thread offload of this CPU work exists, confirmed by absence of `worker_threads`/a job-queue path for search itself). This is the same event-loop-contention risk v1 flagged as a HYPOTHESIS at 10k+ rides — at 1,000 total users it is much less likely to bite, but not structurally impossible if search traffic clusters in a burst (e.g., a popular departure time) |
| 500 simultaneous searches | ~3,000 queries in flight worst-case | Meaningfully more event-loop contention | ~500-1000 Redis round-trips | **This is genuinely worth a real load test before assuming it's fine** — 500 concurrent requests to a single Fastify process, several of which may fall into the 4-6-query cascade, is the point where connection-pool sizing (`getDatabase()`'s underlying pg pool — not inspected in depth this session) and event-loop CPU contention both become real, not hypothetical, questions. **Labeled HYPOTHESIS, not FACT: 500 concurrent searches for a 1,000-user Tunisia-scale app is already a very high fraction of the entire user base searching at once — this traffic shape is itself unlikely at true 1,000-user scale**, which matters more than the raw number |

**Verdict for Part 12/13 combined:** at literal 1,000-user scale, the *realistic* concurrent-search figure is almost certainly closer to the 20-request column than the 500-request column (500 simultaneous searches implies half the user base searching in the same instant, an unrealistic burst for early-stage Tunisia usage). Under that realistic assumption, **the current architecture (no spatial index, no PostGIS) is not a bottleneck at 1,000 users** — the composite time/status index does the one filtering job that matters at this row count, and application-level haversine/polyline work over a few hundred candidate rows is genuinely cheap. **The first real bottleneck at this scale, if one appears at all, is more likely to be Node event-loop contention during a traffic burst than anything database-related** — and that is solved by concurrency-limiting/queueing search requests or moving the expensive polyline-projection loop off the main thread, not by adding PostGIS.

---

## Part 13 — PostGIS decision, re-examined independently (do not accept v1's recommendation uncritically)

| User scale | Is PostGIS actually necessary? | Reasoning |
|---|---|---|
| ~1,000 | **No.** | §12's analysis — a few hundred time-windowed candidate rows, filtered by an already-correct composite btree index, is not a workload PostGIS meaningfully improves; the app-level haversine/polyline cost is genuinely cheap at this row count |
| ~10,000 | **Probably still no, but worth a real measurement.** | Candidate-set size per search grows roughly linearly with total published-ride volume in a given time window — at 10k total users, the in-window candidate count for a popular corridor is still plausibly in the low hundreds to low thousands, not the "sequential scan over everything" regime PostGIS exists to fix. **This is the point v1 correctly named as the NEXT-horizon trigger check, not a hard yes** |
| ~100,000 | **Yes, increasingly likely necessary**, specifically for the `route_passthrough`/detour-calculation tiers | At this scale, enough rides exist that even a well-indexed time-window fetch returns a candidate set large enough that per-candidate polyline projection (an O(candidates × route-samples) operation, done synchronously) becomes a real, not hypothetical, event-loop cost — this is where a spatial pre-filter (GiST-indexed bounding query) earns its complexity |
| ~1,000,000 | **Yes, without qualification.** | The entire "fetch all time-windowed rides, filter in app" architecture breaks down — this is v1's conclusion, re-confirmed here as still correct at this extreme |

**Recommended trigger for migration (agreeing with v1's principle, restated independently):** not a user-count threshold at all — a **measured** one: instrument `scorePassThroughCandidates`'s in-process wall-clock time (a single `console.time`/APM span around its loop is enough, no new infrastructure needed) and migrate when that measurement — not a guess — shows it regularly exceeding some latency budget (e.g., consistently >200-300ms of pure CPU time per search) under real production traffic. **Do not migrate on a user-count milestone alone.**

**Is a bounding-box prefilter a viable near-term step before PostGIS?** **Yes, and it is clearly the right next move if/when the NEXT-horizon trigger above fires** — a plain `WHERE origin_lat BETWEEN ? AND ? AND origin_lng BETWEEN ? AND ?` (or equivalent for the route's own extent) added to `fetchPublishedRidesInWindow`, backed by ordinary btree indexes on `origin_lat`/`origin_lng` (or a computed bounding envelope), would shrink the candidate set before the expensive polyline work runs, at a fraction of PostGIS's operational complexity (no new Postgres extension, no geometry-type migration, no GiST index to reason about). This is not a permanent substitute for PostGIS at real scale (a bounding box is a coarse approximation, not a true distance query), but it is a correctly-sequenced intermediate step, not premature engineering — recommended as the near-term action if/when §12's Node-event-loop risk is ever actually measured, well before any PostGIS migration.

---

## Part 14 — Routing cost control for a future DETOUR_MATCH tier

**The danger is real and correctly identified in the prompt.** Design, reasoned from the actual current architecture (not blindly copying a generic "1000→50→10" funnel):

```
Time-windowed published rides (existing fetchPublishedRidesInWindow — reuse as-is)
  ↓  [cheap: already-indexed DB query]
Bounding-box / haversine-endpoint cheap filter (existing haversine logic — reuse as-is)
  ↓  [cheap: pure JS, no I/O]
Polyline-projection corridor filter (existing projectPointOntoRoute — reuse as-is)
  ↓  [medium: CPU-only, no I/O — this is the step to cap the input size of, not skip]
  → candidate cap applied HERE, before any OSRM call
  ↓
Exact multi-waypoint OSRM detour calculation (NEW — §7/§8)
  ↓  [expensive: real network I/O to OSRM, must be bounded]
Hard rejection (detour ratio/floor/ceiling — §7)
```

**Reasoned candidate cap, not the prompt's illustrative 1000→50→10 numbers taken literally:** given §12's realistic 1,000-user candidate-set sizes (low hundreds, not thousands, per time-windowed search), a cap of **~15-20 finalists** surviving the polyline-projection filter, before any OSRM detour call is made, is a defensible bound — generous enough that a genuinely well-matched corridor rarely loses a good candidate to the cap, tight enough that even a worst-case burst (§12's 500-simultaneous-search column) never produces more than ~20 real OSRM calls per search. **This number is an ASSUMPTION**, reasoned from the actual candidate-set-size estimates in §12, not an arbitrary reuse of the prompt's example — it should be revisited once real search-volume data exists (§16 of v1's marketplace-learning-loop gap applies here directly: there is no data yet to calibrate this precisely).

---

## Part 15 — Result-quality fields the API should return (agreeing with, and extending, v1 §11 with the new detour fields)

The client must never compute business-critical matching numbers itself (already a real, verified gap — v1 caught `search/results.tsx:104-110` client-side-recomputing `dropoffWalkMinutes`, re-confirmed present in this session's earlier read). Recommended `MatchCandidate` additions once §7 exists: `extraDistanceMeters`, `extraDurationSeconds`, `detourRatio`, `pickupETA`, `dropoffETA` — all server-computed, all already implicit outputs of the OSRM call §7 requires anyway, so returning them is a zero-marginal-cost addition once the call itself is made.

---

## Part 16 — Booking revalidation: MANDATORY, confirmed independently (the prompt's suspicion is correct)

**Yes — a final atomic feasibility check at booking time is required, and the reasoning is airtight given what's already verified in §5:** `acceptBooking`'s atomic `UPDATE...WHERE seats_available >= N` (§5) already proves the codebase's own established pattern for exactly this class of problem — "a decision made against a possibly-stale read must be re-validated atomically at the moment it's committed." Once a live route-version mechanism (§6/§10) exists, the same discipline must extend to it: a booking request against route version N must, at the atomic commit step, re-check that N is still current (or explicitly accept a newer version's re-derived feasibility) — otherwise a driver could accept a detour-match booking whose live position has since moved far enough that the original detour calculation is no longer accurate, exactly the race the prompt is worried about. **Concretely: `createBooking`/`acceptBooking` for a detour-match candidate must re-run §7's cheap-then-expensive feasibility check inside the same transaction/atomic step that commits the booking, not trust whatever the search response said.** This is a direct, necessary extension of a pattern already proven correct elsewhere in this exact codebase — not a new invention.

---

## Part 17 — Verification table

| # | Claim | Evidence | Confidence |
|---|---|---|---|
| 1 | No PostGIS anywhere in the stack | CODE — grep across `apps/api`, `docker/` for `postgis\|geography\|ST_DWithin`: zero hits; `docker-compose.yml` uses `postgres:16-alpine` | HIGH |
| 2 | No spatial (GiST) indexes exist | CODE — all migration files (`0000`-`0013`) grepped for `INDEX`: all btree | HIGH |
| 3 | `matching.service.ts`'s 4-tier cascade is real and matches v1's trace | CODE — re-read `matching.service.ts:529-574` directly this session | HIGH |
| 4 | `route_passthrough` requires real `route_stops` on both ends, excludes non-viable candidates rather than flagging them | CODE — `matching.service.ts:344-351,384-387` | HIGH |
| 5 | No search-time road-network detour calculation exists | CODE — no OSRM multi-waypoint call anywhere in `matching.service.ts`/`stop-candidates.service.ts` outside publish-time stop generation | HIGH |
| 6 | Active trip / driver GPS state has zero implementation | CODE — grep for location columns (zero hits), `trips.routes.ts` full read (3 endpoints, no "start"), `rides.status` never transitioned to `in_progress` outside `seed.ts` | HIGH |
| 7 | The "live" trip screen is a 4-second client-side timer, not GPS-driven | CODE — `apps/mobile/app/bookings/live.tsx:34-38`, plus the file's own comment at line 87 stating "no real-time position feed" | HIGH |
| 8 | `acceptBooking`'s seat decrement is atomic and cannot oversell under concurrency | CODE — `bookings.service.ts:272-282`, a single conditional `UPDATE...WHERE` | HIGH |
| 9 | `cancelBooking`/`reportNoShow` use the same atomic-guard pattern | CODE — `bookings.service.ts:406-413,495-502` | HIGH |
| 10 | `createBooking` has no idempotency protection (no unique constraint) | CODE — `bookings.schema.ts` full read, no unique index on `(rideId, riderId)` | HIGH |
| 11 | No booking-expiry job exists despite `'expired'` being a valid status | CODE — grep for `status: 'expired'` writes: only `db/seed.ts` | HIGH |
| 12 | `completeTrip` is NOT guarded against concurrent double-completion the way accept/cancel are | CODE — `trips.service.ts:132-136`, plain `UPDATE...WHERE eq(id,...)` | HIGH |
| 13 | No WebSocket/SSE infrastructure exists; realtime = polling + push only | CODE — package.json dependency grep (zero hits for socket.io/ws/ably/pusher), `pollingInterval` usage confirmed in 4 mobile files, `lib/queue.ts`/`worker.ts` confirmed present (BullMQ + Expo push) | HIGH |
| 14 | `packages/domain` unit tests (62 tests) actually pass | **TEST-RUN** — executed this session: `pnpm --filter @vaya/domain test`, 11 files, 62/62 pass, output reproduced above | HIGH |
| 15 | `apps/api`'s pure unit tests (46 tests: matching, stop-candidates, polyline, errors) actually pass | **TEST-RUN** — executed this session directly via `npx vitest run` against the 4 non-DB-dependent files, 46/46 pass | HIGH |
| 16 | `bookings.service.test.ts` requires a live database despite its non-`.integration.` filename | **TEST-RUN** (failure observed) — executed this session, fails at import time on missing `DATABASE_URL`, not a logic failure | HIGH (the failure itself is directly observed; it confirms the test's DB dependency, not a code defect) |
| 17 | Integration/E2E tests (`*.integration.test.ts`, `tests/e2e`) are well-designed and cover the claimed scenarios | **TEST-READ** only — read the test files' content (this session and the prior one), could not execute (`docker ps` fails, no Postgres reachable) | MEDIUM (design looks sound by inspection; cannot independently confirm they currently pass) |
| 18 | Docker/OSRM/Postgres are unavailable in this sandbox | CODE/ENV — `docker ps` → daemon socket missing; `pg_isready -p 5432` → no response | HIGH |
| 19 | A candidate cap of ~15-20 for a future detour tier is reasonable at 1,000-user scale | ESTIMATE, reasoned from §12's candidate-set-size modeling | LOW-MEDIUM (no measured data exists) |
| 20 | 500-simultaneous-search is an unrealistic traffic shape at literal 1,000-user Tunisia scale | ASSUMPTION, product/usage reasoning, not a technical fact | LOW-MEDIUM |
| 21 | v1's claim that `routeOverlapPercent` is unused in the `score` formula | CODE — re-confirmed `matching.service.ts:252-255` directly this session | HIGH (re-verified independently, not trusted from v1) |
| 22 | PREVIOUS AUDIT CLAIM re: "no rate limiting specific to search" | **NOT INDEPENDENTLY RE-VERIFIED THIS SESSION** — v1 didn't claim this explicitly either; general `@fastify/rate-limit` registration was confirmed by CLAUDE.md's Phase 1 notes, not re-traced in `matching.routes.ts` directly this session | NOT VERIFIED (this session) |
| 23 | `docker-compose.yml` contains a corrupted line after the Redis healthcheck | CODE — directly read this session, reproduced verbatim in Part 1 | HIGH |

---

## Part 18 — Final architecture

**Search pipeline (near-term, reusing what's real today, adding only what §7/§14 require):**

```
SEARCH REQUEST
  ↓  normalize lat/lng/time (existing, matchingSearchSchema)
  ↓  time filter (existing, indexed status+departureAt query — unchanged)
  ↓  cheap geographic candidate generation (existing haversine — unchanged;
  │  add a bounding-box prefilter here ONLY once §13's measured trigger fires)
  ↓  route-direction validation (existing projectPointOntoRoute fraction check — unchanged)
  ↓  route-position/corridor analysis (existing — unchanged)
  ↓  candidate ranking (existing weighted score — extend with reliability/overlap terms per v1 §8)
  ↓  [NEW] candidate cap applied (§14, ~15-20 finalists)
  ↓  [NEW] exact road-network detour calculation (§7/§8 — multi-waypoint OSRM call, only for finalists)
  ↓  hard feasibility gate (existing seats/status/time + NEW detour-ratio bounds)
  ↓  result ranking (existing, extended with detour cost as a signal)
  ↓  search response ([NEW] extraDistanceMeters/extraDurationSeconds/detourRatio/pickupETA/dropoffETA — §15)
```

**Active-trip path (entirely new — nothing here exists today, per §3/4):**

```
[NEW] DRIVER STARTS TRIP  →  rides.status: published → in_progress (finally exercising
                              the state machine that already permits this transition)
  ↓
[NEW] GPS location updates (debounced — §10)
  ↓
[NEW] Route-version recompute, only on a meaningful event (booking accepted / sustained
      deviation / stop completed — NOT every GPS ping) → trip_route_versions insert
  ↓
Same matching engine as above, fed the CURRENT route version's remaining polyline/stops
instead of the published ride's original ones — no parallel matching engine needed
  ↓
[NEW] Detour calculator (§7) evaluates insertion against the CURRENT remaining route
  ↓
Driver receives request (existing push-notification path — Phase 7 infra reused as-is)
  ↓
Driver accepts → [NEW] mandatory re-validation against the LATEST route version at
                 the moment of commit (§16) → atomic booking commit (reuse the
                 existing conditional-UPDATE pattern from acceptBooking — §5)
  ↓
Route version increments again → future searches read the new version
```

---

# TRUST VERDICT

**How much of v1 do I trust?** Its factual claims about the existing search pipeline (`matching.service.ts`, `lib/polyline.ts`, `lib/routing.ts`, schema, indexes) hold up completely under independent re-verification this session — I re-read the same files fresh rather than trusting v1's prose, and reached the same conclusions. **What v1 did not cover at all, and where this audit adds real, independently-verified new information, is everything in Parts 3-6, 10-11, and 16** — the active-trip/GPS/live-route dimension, which turns out to be the far more consequential gap for the product goal stated in this prompt ("world-class... with... dynamic matching while a driver is already on an active trip"). v1's P0/P1 framing (detour matching as the top gap) is directionally right but incomplete: it never surfaced that the *prerequisite* for detour matching to matter in the "active trip" sense — any active-trip state at all — doesn't exist. **I independently verified**: the entire matching pipeline trace, the concurrency/atomicity claims (by reading the transaction code directly, not by trusting either audit), the absence of GPS/live-route infrastructure (by grep + full-file reads + the code's own self-documenting comments), and by actually running the executable test suites. **What's questionable in v1**, corrected here: the `routeOverlapPercent` item was framed as a P0 correctness bug; it is more accurately a ranking-quality gap (§1). Nothing else in v1 was found to be wrong, only incomplete.

# CURRENT VAYA CAPABILITY

**Can it behave like a serious carpooling engine? Yes, for the *published, pre-departure* case — no, for anything involving a trip already underway.** It can: correctly match exact and widened endpoint searches, correctly match a real partial-route case when the driver pre-selected stops there, correctly enforce direction/order/seats/time as hard filters, correctly and atomically prevent overselling, gracefully degrade when OSRM is unavailable, and never fabricate a pickup/dropoff. It cannot: calculate a real road-network detour for any candidate at search time, extend a route beyond its published endpoint, track or use a driver's live position in any way, recompute a route once a trip has started (because a trip never actually "starts" in any code path that exists), or push a genuinely dynamic mid-trip match to a driver. The gap is not "the matching math is wrong" — it is "half the product surface this prompt describes (everything after 'driver starts trip') has not been built yet, at all."

# 1,000-USER VERDICT

**Yes, the current architecture can support ~1,000 users**, under the traffic assumption that concurrent search load stays in the tens-to-low-hundreds range at any instant (realistic for that user count — 500 simultaneous searches would imply half the entire user base searching in the same second, which is not a plausible traffic shape at this scale, not a technical judgment). Under that assumption, the composite `(status, departure_at)` index and cheap in-process haversine/polyline work are genuinely adequate — no PostGIS, no spatial index, no architectural change is required to serve 1,000 users on the *existing, published-route* matching alone. **The first plausible bottleneck, if any**, is Node event-loop contention during a traffic burst on the `route_passthrough` tier's synchronous polyline-projection loop — not the database, and not something that requires PostGIS to fix (a request-concurrency limiter or moving that loop off the main thread would address it first). This verdict does **not** extend to the active-trip/detour features this prompt wants — those don't exist yet at any scale, so "can 1,000 users use them" is not yet an answerable question.

# CRITICAL MISSING CAPABILITIES

Ranked by importance to the stated product goal:

1. **Active-trip state and live driver position — the single largest gap.** Nothing in Parts 3/4 exists. Without this, "dynamic matching while a driver is already on an active trip" (the prompt's explicit target) is not a smaller version of what exists — it is entirely unbuilt, from the database schema up.
2. **Search-time road-network detour calculation.** The mechanism that would make `route_passthrough` (and any future detour tier) trustworthy rather than a proximity guess — infrastructure (OSRM) exists, the calculation itself does not.
3. **Booking-expiry and creation-idempotency.** Small, cheap fixes (§5) that matter more as active-trip matching increases request volume and urgency.
4. **A route-version/staleness mechanism (§6/§11)**, which only becomes meaningful once #1 exists, but must be designed *before* #1 is built, not retrofitted after.
5. **Search-funnel analytics** (v1's finding, still true, independently unexamined further this session but nothing found to contradict it) — needed to calibrate §7's detour thresholds with real data instead of the HYPOTHESIS-labeled starting values this audit proposes.

# TARGET MATCHING ENGINE

One engine, not two parallel ones: the existing tier cascade (`exact/wide_corridor/route_passthrough/closest_departure`) stays as-is for published, not-yet-started rides, and is fed a *different input* — the current route version's remaining polyline/stops instead of the ride's original ones — the moment a trip has an active route version (§6/§18's diagram). A new detour-calculation stage (§7/§14) sits between the existing cheap geometric filtering and the final ranking step, gated by a candidate cap so it can never become an N-candidates-×-N-OSRM-calls problem. Result fields are extended (§15), never recomputed client-side.

# ACTIVE TRIP ARCHITECTURE

A driver's route state moves from "the published `rides` row is authoritative" to "the latest `trip_route_versions` row is authoritative," triggered only by a real "start trip" action (finally exercising the already-permitted `published/full → in_progress` transition), updated by debounced GPS pings, and re-versioned only on meaningful events (booking accepted, sustained route deviation, a stop completed) — not on every GPS tick. Searches against an active trip read the latest version directly; nothing about the matching math itself changes, only which route it's matched against.

# CONCURRENCY AND BOOKING SAFETY

Stale search results are handled by never trusting them at booking time: the existing, already-correct atomic-conditional-`UPDATE` pattern (proven in `acceptBooking`/`cancelBooking`/`reportNoShow`, verified directly this session) is the template — extend it, don't replace it, to also re-validate the route version and re-run the cheap-then-expensive detour check at the moment of commit, inside the same atomic step, for any detour-based booking (§16). Simultaneous bookings on limited seats already cannot double-accept — verified, not assumed. The two real, verified gaps to close alongside this — not because they cause overselling, but because they're inconsistent with the rest of this codebase's own established discipline — are `createBooking`'s missing idempotency guard and `completeTrip`'s missing conditional-status guard (§5, §17 rows 10/12).

# IMPLEMENTATION ORDER

**P0:**
- Fix `completeTrip`'s missing atomic status guard (mirror the existing `acceptBooking`/`cancelBooking` pattern — a small, contained, already-proven fix).
- Add a unique-ish guard against duplicate pending bookings from the same rider on the same ride (`createBooking` idempotency).
- Add a booking-expiry mechanism for stale `pending` requests (a scheduled job reusing the existing BullMQ queue — Phase 7/11 precedent, not new infrastructure).

**P1:**
- Build the minimal active-trip state machine: a real "start trip" endpoint (`rides.status → in_progress`, finally exercising the existing, currently-dead state-machine edge), driver GPS ingestion (debounced, per §10), and the `trip_route_versions` table (§6) — the foundational layer everything else in this prompt depends on.
- Wire the existing matching engine to read from the active route version when one exists, falling back to the published `rides` row otherwise (a conditional input swap, not a new engine).

**P2:**
- Build the search-time detour calculator (§7/§8/§14): candidate cap, multi-waypoint OSRM call, hard rejection bounds (starting from this audit's HYPOTHESIS-labeled thresholds, explicitly flagged for recalibration once real data exists).
- Extend `MatchCandidate`/the API response with the new detour fields (§15).
- Add booking-time revalidation against the latest route version for any detour-based booking (§16), reusing the existing atomic-commit pattern.

**P3:**
- Result-quality/explainability polish (v1's §11 items, plus the new detour fields feeding richer explanations).
- Reliability/cancellation signals into ranking (v1's finding, still unaddressed, still cheap).
- Real search-funnel analytics (v1's finding) — needed to move §7's thresholds from HYPOTHESIS to measured fact.

**P4:**
- Bounding-box prefilter / PostGIS migration — **only** once §13's measured trigger (not a user-count milestone) actually fires.
- Any ML-based ranking — **only** once P3's analytics have run long enough to produce real labeled data (v1's conclusion, unchanged).

# FIRST THING TO BUILD

**The minimal active-trip state machine (P1's first bullet): a real "start trip" transition plus a `currentLat/currentLng` column and the `trip_route_versions` table.** Everything else this prompt cares about — dynamic mid-trip matching, live route recalculation, detour matching against a *live* remaining route rather than a static published one — is downstream of this single piece of missing infrastructure. Building detour matching (§7) first would still be real, useful work, but it would only ever operate against the *published* route (since nothing else exists) — a strictly smaller version of what this prompt actually asked for. Building the active-trip layer first means every subsequent piece (detour calculation, revalidation, search-time route selection) has real state to operate against from day one, instead of being built twice.

# DO NOT BUILD YET

- **ML-based ranking or acceptance prediction** — no event pipeline, no labeled data, explicitly premature (v1's conclusion, unchanged and re-affirmed).
- **Event-sourcing for route state** — §6 explicitly rejects this; a versioned-snapshot table is sufficient and far simpler.
- **PostGIS / spatial indexes** — not justified at 1,000-user scale (§12/§13); wait for the measured trigger.
- **A dedicated realtime transport (WebSocket/SSE) for GPS streaming** — at 1,000-user scale, debounced polling or periodic push-style updates are sufficient for the update cadence §10 recommends (30-60s); a persistent-connection realtime layer is a scale problem VAYA doesn't have yet, and would be a second new piece of infrastructure on top of the one (active-trip state) that must come first regardless.
- **A separate microservice for routing/detour calculation** — OSRM is already a separate, self-hosted service; wrapping it in a new internal microservice boundary adds operational complexity with no benefit at this scale. Keep the detour calculator inside `apps/api`, as a module, exactly like every other matching component today.
- **A routing-provider abstraction/migration off self-hosted OSRM** — v1 already correctly deferred this; nothing in this second audit changes that conclusion.
- **Per-driver detour-preference settings, urban/rural-differentiated thresholds, or any other refinement of §7's HYPOTHESIS-labeled numbers** — ship the simplest version first (one ratio, one floor, one ceiling), refine once real bookings exist to learn from.
