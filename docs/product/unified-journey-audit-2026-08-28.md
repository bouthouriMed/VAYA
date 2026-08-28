# VAYA — Technical Audit vs. Unified Driver & Passenger Journey Specification

**Date:** 2026-08-28
**Spec audited against:** `docs/unified_driver_and_passenger_journey.md` (target/desired-state — not modified by this audit)
**Method:** Direct code inspection (file:line citations, not filename inference) across `apps/api`, `apps/mobile`, `packages/domain`, DB schema/migrations, and background workers, as of `main` @ `8b61f21`. No production code was modified. This document supersedes `CLAUDE.md`'s prior "zero live-GPS infrastructure" claim, which was stale (see §31–37 below).

---

## 1. Executive Summary

**Already strong — more built-out than `CLAUDE.md` itself suggested:**

- **Segment-aware seat capacity is real**, not a global counter. A sweep-line interval-overlap model (`packages/domain/src/booking/segment-capacity.ts`) correctly tracks per-segment occupancy along a route, enforced atomically (`SELECT...FOR UPDATE` + conditional `UPDATE...WHERE status=`) in `acceptBooking`/`cancelBooking`/`reportNoShow`. The spec's own canonical example — 3 seats, A rides Madrid→Zaragoza, B and C both ride Zaragoza→Barcelona on A's freed seat — is proven correct by a real Postgres integration test (`bookings-segment-capacity.integration.test.ts`).
- **A genuine live-tracking system already exists and is wired end-to-end**: driver GPS broadcast (`useDriverLocationBroadcast.ts`, foreground), WebSocket + Redis fan-out, server-computed live ETA, and two independent automatic-completion mechanisms (GPS-proximity auto-complete plus a BullMQ staleness sweep that force-closes abandoned trips). This directly contradicts `CLAUDE.md`'s prior "Known gaps" claim of "zero existing infrastructure" for active-trip/live-GPS — corrected in the same change as this audit.
- **Search almost never dead-ends.** A real fallback cascade (endpoint/corridor match → routing-engine detour insertion → 14-day closest-departure lookahead) means an empty `tier: 'none'` result is reached only after every mechanism, including a two-week lookahead, comes up empty.
- Per-passenger, segment-specific pickup/dropoff ETAs (not the driver's raw departure time) are genuinely computed and correctly displayed to the rider.
- "Best Fit" is a real server-computed signal, surfaced in the UI as "BEST MATCH," not a hardcoded label.
- Deep-links to native Maps apps for pickup/dropoff navigation are real and wired on both driver and passenger sides.
- No-cancellation-after-trip-start and cancelled-record preservation are both correctly enforced server-side (though see P1 finding on the asymmetric ride-level cancel path).

**Biggest gaps:**

1. **In-progress/live matching does not exist at all.** The instant a ride's status flips to `in_progress`, it vanishes from every search tier — not "restricted to remaining corridor" as spec §30 requires, but entirely invisible, even for segments still fully ahead of the driver (e.g. Lleida→Barcelona while the driver has only passed Zaragoza). No code path in `matching.service.ts` reads `trips.currentLat/currentLng` at all.
2. **Segment-specific pricing does not exist.** A passenger boarding for any fraction of a route is charged the driver's full listed per-seat price, unconditionally (`bookings.service.ts:493`). Directly contradicts spec §24, and is a live, materially-incorrect passenger-facing price today.
3. **"Same passenger journey across multiple drivers" has zero schema representation.** Spec §20's "3 active requests, first acceptance wins, others auto-cancel" presumes bookings can be grouped as one journey across rides. No grouping key exists — a rider can hold unlimited concurrent pending bookings across different drivers with no cap, and accepting one never touches any of the others.
4. **No request/response deadline is enforced anywhere server-side.** The mobile UI shows a live countdown (`bookings/confirmed.tsx`) that is purely `Date.now() + 7min`, client-local, with its own code comment admitting no backend expiry policy exists. `bookingStatusEnum` includes `'expired'` as a state, but nothing in runtime code ever sets it — it's only ever written by `db/seed.ts` demo fixtures.
5. **Automatic trip-start and boarding inference don't exist** (100% manual driver-tap), while automatic proximity transitions (approach/arrival) and automatic completion genuinely do exist for the back half of the lifecycle — an asymmetric, partially-solved picture.
6. **Search/candidate-pooling still filters on the old global `seatsAvailable` scalar**, even though acceptance/cancellation are now segment-aware — a live false-negative: a ride can be wrongly hidden from search for a segment that is genuinely free, because a *different* segment on the same ride is saturated.
7. **Admin-configurable matching/detour/ETA thresholds don't exist.** They're hardcoded, profile-scaled constants (`packages/domain/src/matching/matching-thresholds.ts`); the admin app is real (Dashboard/Rides/Users/Verifications/Analytics/Reports) but has no settings surface at all, not even for the two config tables (`pricing_configs`, `recurring_detection_configs`) that already exist as DB rows with admin-editable intent.
8. **Driver-initiated whole-ride cancellation does not cascade.** `POST /rides/:rideId/cancel` only flips `rides.status`; any `pending`/`accepted` bookings on that ride are silently orphaned — no trip update, no notification, no seat recompute, no conversation closure. This is a live data-integrity gap, not just a UX gap.

**Biggest architectural risks:**

- In-progress matching (#1) and segment pricing (#2) need new capability grafted onto a currently-static, single-full-route model — not a patch.
- The cross-ride "same journey" gap (#3) needs a genuine schema addition (a journey/request-group key) plus a new multi-ride lock-ordering discipline this codebase has never had to solve (every existing lock is scoped to exactly one ride).
- Pickup/dropoff "stops" are implemented as fixed, literal coordinates baked in at candidate-generation time, not corridor intent refined per-passenger — a direct contradiction of spec §5's explicit data model, and itself an architectural decision, not a quick fix.

**Biggest contradictions:**

- `route_passthrough` — the tier purpose-built to answer "does this route pass through my corridor" — **hard-requires pre-configured driver stops on both ends** (`matching.service.ts:634`), directly contradicting the spec's explicit invariant "a driver-selected stop is not required for a feasible passenger match" (§54, §62). This exact defect was already flagged by the project's own prior internal audit (`docs/product/search-engine-audit-v2-active-trip-2026-08-23.md`) and was never fixed.
- Segment-aware capacity (real, tested, correct) and full-route-only pricing (flat, unconditional) shipped in the same commits — a documented, deliberate asymmetry, not an oversight.
- `cancelBooking` correctly enforces "no cancellation after trip start" (`assertTripNotStarted`); `cancelRide` (whole-ride, driver-initiated) has no such guard at all, and the ride state machine explicitly permits `in_progress → cancelled` — the same product rule enforced at one level, silently absent at the sibling level.
- The passenger-facing deadline countdown implies a server-enforced deadline that does not exist server-side at all — fabricated-certainty UI, which the project's own CLAUDE.md principle #4 ("never let a screen show fabricated success") explicitly warns against.

---

## 2. Requirement Matrix

Status legend: **CORRECT** / **PARTIAL** / **INCORRECT** / **MISSING** / **UNCLEAR** / **ARCHITECTURAL CONCERN**

### 2.1 Core model & search (§1–3, 7, 9, 10, 56, 62)

| Requirement | Status | Evidence | Explanation |
|---|---|---|---|
| P1 — search finds the best solution, not a DB filter | PARTIAL | `matching.service.ts:1120-1170` `searchRides` | Real multi-stage cascade exists, but each stage is a static geometric/time query against a `rides` snapshot — no notion of "best solution" beyond per-stage scoring; stages never cross-compare (see §3.1). |
| P2 — driver publishes corridor, not every segment | CORRECT (with caveat) | `scorePassThroughCandidates` (`:561-701`), `scoreDetourCandidates` (`:725-881`) | Zaragoza→Barcelona is genuinely derived, never manually configured. Caveat: `route_passthrough` still requires a driver-placed stop near both rider endpoints — see next row. |
| P3 — partial route overlap, no exact-match requirement | CORRECT | `scorePassThroughCandidates`, `polyline.ts:128-161` (`projectPointOntoRoute`) | Real OSRM/Google polyline projection with direction ordering, not a straight-line proxy. |
| §54/§62 — driver stop not required for a feasible match | **INCORRECT** for the `route_passthrough` tier | `matching.service.ts:634`: `if (rankedStops.length===0 \|\| rankedDropoffStops.length===0) continue;` | Directly contradicts the named invariant. Only rescued at the whole-search level by `detour_match`, and only when the merged endpoint+passthrough stage found nothing at all. Already flagged by a prior internal audit, unfixed. |
| §7 — exact/strong/partial/expanded results, not a bare filter | CORRECT | `matching.service.ts:1120-1170` | Endpoint+passthrough (merged) → `detour_match` (routing-engine waypoint insertion, capped 15 candidates) → `closest_departure` (14-day lookahead) → only then `tier:'none'`. Honest per-tier messaging (`TIER_MESSAGES`), not silent relaxation. |
| §9 — past trips never searchable (hard requirement) | **INCORRECT (over-satisfied harmfully)** | Every fetch path filters `status='published'` (`matching.service.ts:339-360`; `spatial.ts:86,134,178`) | Not "exclude the passed portion" — the whole ride disappears the instant `syncRideStatusOnTripStart` flips it to `in_progress` (`trips.service.ts:148-156`), including segments still fully ahead of the driver. Stricter than the spec and product-breaking for the spec's own headline scenario. |
| §10/§56 — never return bare "no rides found" if alternatives exist | CORRECT | Same 4-stage cascade | Verified: `closest_departure` alone requires all of endpoint/passthrough/detour to be empty first. |
| §30/§50/§62 — in-progress trip matched against remaining corridor only | **MISSING** | Zero references to `trips`/`currentLat`/`currentLng` anywhere in `matching.service.ts` (confirmed by direct read + repo-wide grep) | No code path reads live driver position for matching at all. The write side (`POST /trips/:id/location`) populates this data; nothing on the read/matching side ever consumes it. |
| Corridor overlap computation method | UNCLEAR→now CLEAR | `polyline.ts` (`projectPointOntoRoute`, `computeRouteOverlapFraction`), `spatial.ts` (PostGIS `ST_DWithin` stage-1 filter), `scoreDetourCandidates` (real per-candidate routing call) | Geometric polyline proximity (cheap, PostGIS-prefiltered) backstops two tiers; a genuine road-network routing-engine call (expensive, capped to 15 candidates) backstops the no-stop-required fallback. No tier ever uses the driver's *live* position — always the ride's static stored route. |

### 2.2 Driver publishing, pickup/drop-off, corridor stops (§4, 4.1, 4.2, 5, 13, 14, 18, 54, edge case 53)

| Requirement | Status | Evidence | Explanation |
|---|---|---|---|
| §4.1/4.2 — pickup/dropoff recommendations near origin/destination | PARTIAL | `apps/mobile/app/(tabs)/publish.tsx:745-756` (`buildRecommendedPoints`), `stop-candidates.service.ts:100-102` (`edgeMarginM` exclusion) | Reuses the same route-sampled candidate pool that deliberately excludes the origin/destination vicinity ("those are the ride's own endpoints, not new candidates") — an architectural mismatch when that same pool is then asked "what's near the origin?" Degrades for short/urban trips. |
| §4.1/4.2 — exclude highways | CORRECT (generated candidates only) | `stop-candidates.service.ts:55` `REJECTED_ROAD_CLASSES`, hard reject in `scoreStopCandidate:206` | Classification is **speed-inferred** (sustained ≥25 m/s ⇒ motorway), not real OSM way-class tags — OSRM in this deployment returns none (verified live, documented in-code). A real proxy, not ground truth: false positives/negatives both possible with no fallback signal. |
| §4.1/4.2 — exclude pedestrian-only / operationally unsuitable areas | **MISSING** | No pedestrian-zone, no-stopping-zone, or parking-feasibility signal anywhere in `stop-candidates.service.ts` | Only the 4-bucket speed classification stands in for the entire "operationally suitable" requirement — a genuine gap, not an imprecise proxy. |
| §4.1 default "anchor" point (raw geocoded origin) | **INCORRECT against its own spec line** | `publish.tsx:378` `selectedPointId='anchor'` default | The pre-selected default meeting point receives *zero* road/stopping-feasibility validation — directly contradicts "a recommended point should not be somewhere a vehicle cannot reasonably stop." |
| §4.1 manual driver pickup/dropoff placement | **INCORRECT** (bypasses checks the generated path enforces) | `addCustomStop`'s `pickup`/`dropoff` branch (`stop-candidates.service.ts:710-715`) never calls `nearestRoad`; only the `via` role does | A driver dragging a pin for their own exact pickup point gets none of the accessibility checks a generated candidate gets. |
| §5 — selected stop = "willingness to detour," not a fixed pickup coordinate | **INCORRECT** | `bookings.service.ts:401-404`: `pickupLat = stop.lat; pickupLng = stop.lng;` verbatim | The stored, road-snapped candidate coordinate is used directly and literally as the booking's pickup point. No "VAYA later determines the actual point" refinement step exists. Architectural, not a quick fix. |
| §13 — joint driver-detour/passenger-walk optimization | **INCORRECT** | Generation: `scoreStopCandidate:205-222` scores purely on driver-side cost (passenger walk distance plays no role). Selection: `rankStopsByWalkDistance` (`matching.service.ts:270-286`) then ranks the already-fixed set purely on passenger walk distance. `detour_match`'s live routing call hardcodes `pickupWalkMinutes:0` (`matching.service.ts:833-834`). | Two disconnected, sequential single-objective passes, not a joint function. The candidate *set* a passenger ever sees was chosen with zero visibility into that passenger's location. |
| §14/edge 53 — passenger override of recommended pickup + recalculated consequence, informed-not-blocked | **MISSING** | `search/pickup-point.tsx:63-136` only lets the passenger choose among the driver's pre-approved `route_stops` | No free-pin placement, no "choose another VAYA-feasible point," and consequently no recalculation trigger and no "less convenient for the driver" disclosure — because no override mechanism exists at all. Likely intentional per product principle #1 (no free-form pickup entry), but it means §14 is structurally absent, not degraded. |
| §18 — stops surfaced to passenger as contextual corridor intent, not a fixed mechanism | PARTIAL | `RequestDetailSheet.tsx:53-56` | Passenger sees the stop list itself (the driver's already-committed offer) — functions identically for passenger UX whether "contextual" or "fixed." |
| §54 edge case — ride with real stops but none walkable stays visible, flagged not viable | CORRECT | `matching.service.ts:295-297` `isPickupViable` | Zero-stop rides are always pickup-viable (legacy free-form flow preserved); stops genuinely function as a soft signal at this specific check, even though `route_passthrough` (above) treats them as hard-required. |
| Per-trip-length candidate density/detour-budget tuning | CORRECT | `packages/domain/src/route/classify-trip-profile.ts`, consumed in `stop-candidates.service.ts:316,354` | Commute/urban/intercity get differently tuned sampling — matches spec's "recognize Zaragoza/Lleida, not every settlement" intent. |

### 2.3 Pricing & segment capacity (§24–27, 55, 62, edge case 52)

| Requirement | Status | Evidence | Explanation |
|---|---|---|---|
| §24 — passenger-specific segment pricing | **MISSING/INCORRECT** | `compute-suggested-price.ts` only called from `rides.service.ts:39` (ride creation); `bookings.service.ts:493`: `contributionTotal = ride.contributionPerSeat * seatsRequested` | No function anywhere prices less than the full ride. Every passenger, regardless of segment, pays the driver's full-route per-seat rate. `previewBookingDetour` computes real per-segment distance/duration for the driver's UI but this is display-only, never fed into the stored/charged price. |
| §24 — price-formula inputs (detour, occupancy, marketplace conditions, attractiveness) | PARTIAL/MISSING | `compute-suggested-price.ts:63-64`: `baseRatePerKm·distanceKm + timeComponentPerMin·durationMin` only | Two static-rate inputs. Detour impact, occupancy, route economics, marketplace conditions are entirely absent from the formula. `platformFeeRate` exists but is dormant (0, unread) — consistent with `CLAUDE.md`'s own claim. |
| §25/§62 — segment-based capacity, never exceed physical seats on any segment | **CORRECT** (enforcement) | `packages/domain/src/booking/segment-capacity.ts` (`computeMaxConcurrentSeats`, sweep-line interval model, dropoff-before-pickup tie-break at a shared stop); enforced under `SELECT...FOR UPDATE` in `acceptBooking`/`cancelBooking`/`reportNoShow` | Verified against the spec's own canonical example: A (Madrid→Zaragoza), B and C (Zaragoza→Barcelona) all fit under `seatsTotal=3`, proven by a real Postgres integration test — **Yes**, the engine supports it, atomically, at the booking layer. |
| §25 — segment-aware search/candidate pooling | **INCORRECT / ARCHITECTURAL CONCERN** | `matching.service.ts:399,618,766` all gate on the single scalar `ride.seatsAvailable < 1` | The write path (accept/cancel) reasons in full segment detail; the read path (search) reasons in one collapsed bottleneck number. A ride bookable at the exact segment a passenger needs can still be invisible to search for that need — a real, live false-negative, self-documented in the code's own comments (`bookings.service.ts:161-166`) as an unresolved scope gap. |
| §26 — continuous passenger turnover / re-triggered matching as seats free up | **MISSING** | No re-matching job anywhere in `apps/api/src/lib/queue.ts`/workers; `searchRides` only ever queries `status='published'` | The capacity *math* correctly frees a seat the instant an earlier-sequence dropoff exists, but nothing re-opens search candidacy live as a driver actually passes/drops a passenger — compounded by in-progress rides being wholly invisible to search anyway (§2.1). |
| §27/§28 — existing-passenger soft protection with admin-configurable ETA-impact threshold | **MISSING** | Grep across `apps/api/src` for `existingPassenger`/`passengerImpact`/`etaImpact`: zero hits | Nothing recomputes already-accepted passengers' ETAs when evaluating a new request, and nothing gates acceptance on that impact. `assertRealDetourWithinAllowance` only bounds the *driver's own* added detour, not what that detour does to existing passengers' arrival times — these are conflated today, not the same guarantee. |
| §28 — admin-configurable thresholds generally | PARTIAL | `pricing_configs` table is genuinely DB-backed with a pure-default fallback (real precedent). `matching-thresholds.ts:1-18` is a plain hardcoded constant, its own comment noting DB-backed override is future work. | The pricing precedent exists but was never extended to detour/capacity/ETA-impact thresholds. No admin CRUD UI exists for either table — direct-DB-edit/seed only. |
| Edge 52 — new request evaluated against every existing passenger; reject if impact exceeds limits | PARTIAL | Seat side: `wouldExceedCapacity` genuinely checks the new candidate against every existing accepted segment. Impact/timing side: missing (see §27 row). | Capacity conflicts are correctly caught; ETA/timing conflicts on existing passengers are never evaluated beyond the driver's own detour bound. |
| Edge 55 — every passenger independently represented (board/exit/segment/price/ETA) | PARTIAL | `bookings.pickupStopId`/`dropoffStopId`, `BookingSegment{seatsRequested,pickupSequence,dropoffSequence}` | Board/exit/segment are genuinely per-passenger and correctly accounted for. Price is not independent per segment (flat rate regardless) — a direct, live contradiction of "impact on route, price... independently" for the pricing dimension specifically. |

### 2.4 Booking concurrency, deadlines, cancellation, edge cases (§19–23, 38, 46–53, 55, 56, 62)

| Requirement | Status | Evidence | Explanation |
|---|---|---|---|
| §19 — request contains route/time/pickup/dropoff/price/driver-impact/expiry | PARTIAL | `createBooking` (`bookings.service.ts:329-523`) | Has pickup/dropoff/price/seats. No expiry field stored anywhere. Driver-impact (`previewBookingDetour`) is computed on demand at accept time, not stored on the request itself. |
| §20 — up to 3 active requests per passenger per journey, capped | **MISSING** | `createBooking:358-370` — duplicate guard scoped only to `(rideId, riderId)` | No cap in either direction; a rider can hold unlimited concurrent pending bookings across different rides. No "journey" concept exists in schema to count against. |
| §20 — response deadline enforced + visible to both sides | **MISSING** | No `expiresAt` column in `bookings.schema.ts`; `bookingStatusEnum`'s `'expired'` is never set by runtime code (only `db/seed.ts` demo fixtures) | Mobile shows a purely client-local `Date.now()+7min` countdown (`bookings/confirmed.tsx`) with its own code comment admitting no backend policy exists — fabricated-certainty UI. Driver-side `RequestDetailSheet.tsx` shows no deadline at all. |
| §20/§49 — first-acceptance-wins, cross-ride cancellation of sibling requests | **MISSING / ARCHITECTURAL CONCERN** | `acceptBooking` (`bookings.service.ts:596-668`) locks and touches only its own `rideId`; no query anywhere looks up other bookings by `riderId` across rides | No schema concept links two bookings as "the same passenger journey" — root cause, not a missing query. Within one ride, the atomicity is real and correctly generalizes Phase 1/10's fix to segment-aware capacity (`SELECT...FOR UPDATE` + conditional `UPDATE...WHERE status=`), verified sound for concurrent-accept races on the *same* booking/ride. |
| §21/§22 — driver incoming/detail request shows detour, new ETA, deadline, direct (no forced "My Trip" detour) | PARTIAL | `previewBookingDetour` (`bookings.service.ts:815-997`) genuinely computes real detour/new-ETA/pickup-dropoff-time from live routing | Detour/ETA fields are real and good. Deadline is structurally absent (see above). Direct-to-detail navigation confirmed, not routed through My Trip first. |
| §23 — Maps deep-links for driver navigation to pickup | CORRECT | Confirmed present on both driver and passenger sides (mobile `Linking`-based open-in-Maps affordance) | |
| §36/§62 — no cancellation after trip start (booking-level) | CORRECT | `bookings.service.ts:263-268` `assertTripNotStarted`, called before `cancelBooking`'s transaction | Real server-side guard, not UI-hidden. |
| §36/§62 — no cancellation after trip start (ride-level) | **INCORRECT — contradicts the booking-level guard** | `packages/domain/src/ride/ride-status.ts:11-18`: `in_progress: ['completed','cancelled']`; `rides.service.ts:301-321` `cancelRide` has no trip-started check at all | A driver can call whole-ride cancel while `in_progress` with live passengers onboard and it silently succeeds — same product rule, enforced at one level, absent at the sibling level. |
| §38/edge 46 — driver-cancels-ride cascades to bookings/seats/notify/matching/search-eligibility | **INCORRECT** | `cancelRide` (`rides.service.ts:301-321`), route `rides.routes.ts:216-226`: only `UPDATE rides SET status='cancelled'` | Zero cascade logic exists. Any `pending`/`accepted` booking on a cancelled ride is silently orphaned — still reads as `accepted` in `listMyBookings`, trip untouched, no notification, no seat/segment recompute, no conversation closure. A live data-integrity risk: a rider could see a stale "confirmed" trip indefinitely for a ride the driver killed. |
| Edge 47 — passenger cancels; other passengers unaffected, capacity recalculated, driver notified | CORRECT | `cancelBooking` → `recomputeAndPersistRideCapacity` (recompute-from-scratch over the remaining accepted set, row-locked) | Verified: other passengers' segments are untouched by construction; driver notification fires. |
| Edge 48 — driver rejects one request; only that request closes | CORRECT | `declineBooking` (`bookings.service.ts:670-696`) — simple, isolated transition | |
| Edge 49 — first driver accepts; atomic within one ride | PARTIAL | `acceptBooking:617-648`: `SELECT...FOR UPDATE` + conditional `UPDATE...WHERE status=` | Atomicity is real for *this* ride's own capacity/booking transition. The spec's actual cross-driver "other requests auto-cancel" behavior is unbuilt — see §20 row. |
| Edge 51 — driver deviates; preserve planned route, recompute live corridor, preserve existing passengers | **UNCLEAR/MISSING at the booking layer** | No route-deviation handling found in `bookings.service.ts` | Overlaps the in-progress-matching gap (§2.1) — there is no live-corridor concept anywhere yet for this to hook into. |
| Edge 52 | See §2.3 (Pricing & capacity table) | | |
| Edge 53 | See §2.2 (Pickup/drop-off table) | | |
| Edge 55 | See §2.3 (Pricing & capacity table) | | |
| §38/edge — historical records preserved, never hard-deleted | CORRECT | Terminal booking/ride statuses are soft states; FK deletes use `ON DELETE SET NULL`, never cascade-delete | |
| Idempotency on accept/cancel retries | PARTIAL, low risk | No `Idempotency-Key` mechanism exists, but the atomic `WHERE status=` guard means a retried call after a network timeout gets a clean `ConflictError`, not a silent double-process | Surfaces as a spurious user-facing error on retry rather than a data-integrity bug — a UX rough edge, not a correctness risk. |

### 2.5 Notifications (§39)

| Spec event | Exists? | Evidence |
|---|---|---|
| request received | Y | `booking_requested`, `bookings.service.ts:508` |
| request deadline approaching | **N** | No event type; no deadline data exists to trigger it |
| request accepted | Y | `booking_accepted`, `bookings.service.ts:650` |
| other passenger requests cancelled | **N** | Feature doesn't exist (§2.4) |
| driver trip started | Y, conflated | `trip_driver_approaching` fires on `startTrip` but is worded around "approaching," not a distinct "trip started" message |
| pickup approaching | Y | `trip_arriving`/`trip_pickup_arrived`, genuinely GPS-triggered |
| passenger onboard | **N** | `confirmPassengerAboard` only publishes a WebSocket update — no notification row, no push |
| live journey started | **N** | Same transition as above — no distinct event |
| route/ETA changed | **N** | ETA recompute broadcasts via WebSocket only, never persisted/pushed as a notification |
| cancellation | Y | `booking_cancelled` |
| no-show | Y | `booking_no_show_reported` |
| trip completed | Y | `trip_completed`, both parties |
| review requested | Y, conflated | Reuses `trip_completed` as the review-prompt trigger by design |

**7 clean, 2 conflated-but-functional, 4 missing.** Where events exist, copy is genuinely specific (real interpolated names/labels) — the gap is coverage, not quality, and 4 of the 4 missing events are direct symptoms of already-listed P0/P1 gaps (deadlines, cross-ride cancellation, boarding detection, live-corridor tracking-to-matching wiring) rather than independent notification-layer work.

### 2.6 Trip lifecycle & tracking (§29, 31–37, 43, 44, 62) — cross-validated by two independent passes

| Requirement | Status | Evidence | Explanation |
|---|---|---|---|
| §34 — 4-state lifecycle (SCHEDULED→IN_PROGRESS→PASSENGER_ONBOARD→COMPLETED+CANCELLED/NO_SHOW) | PARTIAL | Real enum (`packages/domain/src/trip/trip-status.ts`): `scheduled → driver_approaching → pickup → active → arriving → completed`, plus `no_show`/`cancelled` reachable from any non-terminal status | A reasonable, finer-grained mapping (`active` ≈ PASSENGER_ONBOARD), implicit and undocumented as a reconciliation until this audit. |
| §35 — automatic trip-start inference if driver ignores the CTA | **INCORRECT** | `startTrip` (`trips.service.ts:263-287`) is driver-tap-only; `computeAutoTripStatusTransition` never branches on `'scheduled'` | 100% manual. No time/origin-proximity/movement-based auto-start exists. |
| §33 — boarding detection, multi-signal, buttons non-mandatory | **INCORRECT** | `confirmPassengerAboard` (`trips.service.ts:297-322`) driver-tap only; in-code comment argues GPS proximity can't disambiguate "in the vehicle" from "standing next to it" | Directly contradicts "must not be mandatory" — a deliberate, reasoned deviation (the reasoning is sound), not an oversight, but still a deviation. No passenger-side confirmation action exists either. |
| Automatic proximity transitions (approach→pickup→arriving→completed) | CORRECT | `tracking-transitions.ts:39-70`, GPS-radius-triggered on every location ping | Real and tested for these specific edges. |
| §44/§62 — automatic completion, never stuck indefinitely active | CORRECT | GPS tight-radius auto-complete + `trip-staleness-sweep.worker.ts` (BullMQ: reminder at +30min overdue, force-complete at +3h overdue with ≥1h GPS silence) | Two independent, real mechanisms; the staleness sweep's `WHERE eq(status, trip.status)` re-check correctly handles the GPS-vs-sweep double-close race (verified safe, no double-notification). |
| §37 — contextual no-show (location + timing, not purely self-report) | PARTIAL | `canReportNoShow` (`cancellation-policy.ts:143`) is a pure time gate (≥15 min past `departureAt`); no location/proximity signal despite `trips.currentLat/Lng` being fresh (~7-10s cadence) and available by the time a report could plausibly be filed | Foundation exists, behavior doesn't use it — genuinely PARTIAL, not MISSING. No automatic system-inferred no-show exists at all. Real abuse-vector risk: either party can unilaterally trigger an automatic 1-star rating + reliability penalty on time-elapsed alone. |
| §31 — driver operational tracking (private telemetry) | PARTIAL | `useDriverLocationBroadcast.ts` — real, working, **foreground-only** (`expo-location.watchPositionAsync`, no `ACCESS_BACKGROUND_LOCATION`/iOS "Always") | Explicitly documented as a stated limitation in code, not a silent gap — a reasonable MVP call given background-location's permission/App-Store-review burden. |
| §32/§62 — tracking vs. sharing separation (raw GPS withheld pre-boarding) | **INCORRECT** | `getTrackingState` (`trips.service.ts:490-523`) returns `currentLat/Lng` for any status in `driver_approaching, pickup, active, arriving`; `bookings/[bookingId].tsx:165,260-262` renders the marker whenever a fix exists, gated on data presence not boarding state | The spec's explicit two-tier privacy model collapses into one feed with one shape — a real privacy-posture gap against a named critical invariant (§62 "Tracking"), not just spec-literalism. |
| §43 — live journey post-boarding (real, not mock) | CORRECT | `bookings/[bookingId].tsx` + `useTripTracking.ts` — WebSocket-primary/REST-fallback, animated heading-rotated marker | Genuinely real — this closes the single largest gap a prior internal audit had flagged. Note: a second, legacy passenger navigation path (`pending.tsx → pickup.tsx`) still exists in parallel, has zero dependency on real trip/tracking state, and its code comment still claims live tracking "is a later roadmap phase" — it already shipped via the other path. Two inconsistent routes reach conceptually the same destination. |
| §45 — reviews: fast, tactile, gesture-based, low typing | PARTIAL | `StarRatingInput.tsx:36-74` — tap-per-star with haptics, one `Chip` toggle, `BottomSheet`-hosted | Reasonably lightweight but closer to "compact form" than the spec's "gesture-based, visually engaging" bar; no optional written-comment field is exposed in the UI (API plumbing accepts one), no contextual suggested-feedback tags beyond one chip. |

---

## 3. Existing Architecture (as verified)

### 3.1 The search/matching pipeline

Contrary to `CLAUDE.md`'s own prior description ("5-tier cascade: exact → wide_corridor → route_passthrough → closest_departure → detour_match"), the actual pipeline (`matching.service.ts:1120-1170`) is a **2-stage, parallel-merge-then-conditional-fallback** design:

- **Stage A (always runs, merged):** endpoint-radius matching (`scoreCandidates`) + route-passthrough polyline projection (`scorePassThroughCandidates`, hard-requires driver stops on both ends). Merged, deduplicated by ride, quality-banded, ranked. **If non-empty, the function returns immediately.**
- **Stage B (only if Stage A is completely empty):** `scoreDetourCandidates` — a real per-candidate routing-engine waypoint-insertion call, capped at 15 candidates, accepts only within a 25%-of-baseline detour allowance.
- **Stage C (only if Stage B is also empty):** `findClosestDepartures` — same wide-radius endpoint logic, no time window, 14-day lookahead.
- Only if all three are empty: `tier: 'none'`.

Every stage hardcodes `rides.status = 'published'`. This stage-gating is itself a quality risk independent of the in-progress gap: because Stage B only runs when Stage A is *completely* empty, a search that finds even one weak endpoint/passthrough candidate on a worse ride never even attempts a potentially much better detour-tier candidate on a different ride — stages are never compared against each other, only tried in sequence.

### 3.2 Live tracking

A real system exists, confirmed live in code (not just design-doc intent):

- **Driver-side:** `useDriverLocationBroadcast.ts` — foreground-only `expo-location.watchPositionAsync` (~7-10s cadence), `POST /trips/:id/location`.
- **Server:** persists only the latest fix (`trips.current_lat/lng/heading/speed/accuracy` — no history table, a deliberate privacy-minimization choice), evaluates GPS-based auto-transitions, recomputes a real routing-provider ETA (throttled 20s), fans out via WebSocket room + Redis pub/sub.
- **Passenger-side:** `bookings/[bookingId].tsx` + `useTripTracking.ts` — WebSocket-primary, REST-polling fallback, animated heading-rotated marker.
- **Safety net:** `trip-staleness-sweep.worker.ts`, a real BullMQ repeatable job.

This infrastructure is **simply never connected to matching/search** — `docs/domain/live-tracking.md` makes no mention of matching or search anywhere in the file, and a prior internal audit's recommendation to wire them together was never acted on.

### 3.3 Seat capacity

`BookingSegment{seatsRequested, pickupSequence, dropoffSequence}`, resolved from a booking's `pickupStopId`/`dropoffStopId` against `route_stops.sequence` (a strictly-ordered integer per ride). `computeMaxConcurrentSeats` is a sweep-line over pickup(+seats)/dropoff(−seats) events, ties broken "dropoff before pickup" to avoid double-counting at a shared stop. Enforcement pattern (identical across `acceptBooking`/`cancelBooking`/`reportNoShow`): lock the ride row → re-read all currently-accepted bookings as segments → check `wouldExceedCapacity` → atomically transition the one booking (`WHERE status=<prev>` guard) → recompute and persist `seatsAvailable` from scratch over the full resulting accepted set. Correct and well-tested for the problem it targets; simply not yet consulted by search, which still reads the derived bottleneck scalar (§2.3).

### 3.4 Pricing

`computeSuggestedPrice(distanceKm, durationMin, config)` runs once, at `createRide`/`updateRide`, against the ride's own full origin→destination route. The result is stored as a single scalar (`rides.contributionPerSeat`). At booking time, `contributionTotal = ride.contributionPerSeat * seatsRequested`, unconditionally — the routing calls already made elsewhere for detour validation and driver-facing preview (`previewBookingDetour`) are never routed into a price calculation. No architectural blocker exists to building this — the schema and the routing calls it would need already exist — but it is presently entirely unbuilt.

### 3.5 Booking concurrency

`acceptBooking`'s transaction is scoped to exactly one `rideId`/`bookingId` pair: it locks that ride, re-derives that ride's segments, atomically transitions that one booking, recomputes that ride's capacity, and notifies that one rider. It proves "two drivers cannot both accept the same booking" and "a ride's segments cannot be oversold by concurrent accepts on that ride." It has no mechanism — and the schema has no data to support one — for finding and cancelling a rider's other pending bookings on other rides.

### 3.6 Admin configuration

`apps/admin` is a real, separate React app (Dashboard/Rides/Users/Verifications/Analytics/Reports/AuditLog pages, confirmed present) — not vaporware. But it has no settings/configuration page of any kind. The two config tables that do exist (`pricing_configs`, `recurring_detection_configs`) are DB-row-plus-pure-default-fallback patterns with no admin-panel editing surface. Matching/detour thresholds aren't even a DB row yet — a plain in-code constant.

---

## 4. Critical Technical Concerns

### P0 — Must resolve before implementation planning proceeds

1. **In-progress matching is entirely absent**, and the current behavior (total exclusion of `in_progress` rides from search) is actively worse than doing nothing — it silently kills legitimate, still-feasible searches with no fallback. Any implementation plan must decide the live-corridor computation strategy before touching search code, since matching, capacity, and pricing all currently assume a single static route.
2. **Segment pricing is materially wrong today, live** — every mid-route booking is currently overcharged relative to what the spec (and basic fairness) requires. A monetization-correctness issue, not a nice-to-have.
3. **"Same passenger journey across rides" has zero schema representation.** Every one of spec §20/§48/§49's behaviors (3-request cap, cross-ride first-acceptance-wins, cross-ride cancellation) is blocked on this modeling decision. Patching `acceptBooking` without first deciding this data model will produce a worse half-implementation than the current honest gap.
4. **The passenger-facing deadline countdown is fabricated-certainty UI** — implies a server-enforced deadline that doesn't exist. Per the project's own "never show fabricated success" principle, treat this with the same severity as any screen showing invented data, independent of when real deadline enforcement lands.
5. **Driver-initiated whole-ride cancellation doesn't cascade** — orphaned bookings can leave a rider staring at a stale "confirmed" trip indefinitely, with no notification anything went wrong. A live data-integrity bug, not a missing feature.

### P1 — Important

6. `route_passthrough`'s hard stop-requirement contradicts the spec's explicit driver-stop-not-required invariant and was already flagged once before without being fixed — worth understanding why before re-attempting.
7. Search/candidate-pooling reads the stale global-bottleneck `seatsAvailable` scalar instead of the now-correct segment-aware capacity model — a real, live false-negative in search results today. Cheap, self-contained, and mechanical to fix (reuse `wouldExceedCapacity` against the specific requested segment).
8. Boarding detection and trip-start are 100% manual with no automatic fallback, while the rest of the lifecycle (approach/arrival/completion) has real automatic inference — this asymmetry means the "no cancellation after start" invariant is only as strong as a button tap.
9. Pre-boarding raw GPS exposure to the passenger contradicts the spec's stated two-tier tracking/sharing privacy model — currently a privacy-posture gap, not just spec-literalism.
10. Stop candidates are generated as fixed literal coordinates, not corridor intent refined per-passenger — contradicts §5's explicit data model; needs a genuine new "resolve intent → point" step to align.
11. No-show has no location/proximity corroboration — either party can unilaterally trigger an automatic 1-star rating + reliability penalty on elapsed time alone, a real dispute/abuse vector.
12. `cancelRide`'s missing trip-started guard (contradicts `cancelBooking`'s own `assertTripNotStarted`) — a driver can cancel an `in_progress` ride with live passengers onboard.

### P2 — Can defer

13. Admin-configurable thresholds don't exist, but hardcoded profile-scaled constants are a reasonable interim state per the project's own NOW/NEXT/SCALE discipline — the admin UI surface is real work, not urgent.
14. Notification coverage gaps (deadline-approaching, other-requests-cancelled, passenger-onboard, route/ETA-changed) are each individually simple additions once their underlying features exist — symptoms of the P0/P1 gaps above, not separate work.
15. Review UI is functional but closer to "compact form" than the spec's "gesture-based, visually engaging" bar — a polish item.
16. Stage-gating in the search cascade (Stage B/C only firing when the prior stage is fully empty) risks missing a better cross-stage match — worth a cheap "compute all stages, pick globally-best" refactor once volume justifies it.
17. Foreground-only GPS (no background location) is honestly documented as a limitation; real for hours-long trips but not urgent given current scale.
18. Idempotency-key support for accept/cancel retries — current behavior is safe (no double-processing) but surfaces a spurious error on retry rather than a clean idempotent response.

---

## 5. Technically Questionable Requirements (deep dives)

### 5.1 Dynamic in-progress corridor matching (§29, §30, §50, §62)

**Requirement:** A driver already en route can still receive new requests, matched against their *current* position and remaining route — not their originally-published static route.

**Why it is difficult:** Today, "ride disappears from search once started" is achieved for free as a side effect of the ride-status state machine (`status='published'` filter). Building real in-progress matching requires: (a) keeping `in_progress` rides queryable by matching while still excluding them from the normal booking-creation paths that assume `status==='published'` elsewhere (`bookings.service.ts:343-345`); (b) computing a "remaining route" polyline (from `trips.currentLat/Lng` to the ride's destination, live-routed, not the static stored polyline); (c) re-running `projectPointOntoRoute` against that dynamic remaining route instead of the full stored one; (d) doing this within an acceptable latency/cost budget per search — an extra live routing call per in-progress candidate, stacked on top of the `detour_match` tier's already-capped 15-candidate routing-call budget (itself flagged in-code as an unmeasured assumption).

**Current architecture:** Can support this, but needs a genuinely new subsystem, not a threshold tweak. `trips.currentLat/Lng/locationUpdatedAt` already exist and are already fresh (~7-10s cadence) — the data pipe is there; matching simply never reads it.

**Risk:** Stale GPS: nothing today checks `locationUpdatedAt`'s age before trusting a position for anything; building in-progress matching without a staleness cutoff (reject/degrade beyond N minutes silent) would let a backgrounded driver phone silently corrupt the live-corridor calculation. Cost: doubling down on per-candidate live routing calls compounds an already-unverified-at-scale assumption.

**Recommended approach:** Start with a coarse heuristic rather than full live-corridor recomputation: for an `in_progress` ride, re-check only whether the rider's requested pickup/dropoff points still project forward of the driver's last-known position on the *existing static* polyline (cheap — reuses `projectPointOntoRoute` with a position cutoff, no new routing calls), gated by a `locationUpdatedAt` staleness cutoff (fall back to full exclusion if stale). This directly fixes the "worse than doing nothing" problem (P0 #1) without requiring live re-routing.

**Alternative:** Full live-corridor recomputation (live-routed remaining-route polyline, per-search) is more accurate but materially more expensive and riskier to ship first — better suited as a later refinement once the coarse heuristic's real-world false-positive/negative rate is measured.

### 5.2 Automatic boarding detection (§33)

**Requirement:** VAYA infers passenger boarding from signals (proximity, movement, timing, confirmations) rather than requiring a mandatory manual button.

**Why it is difficult:** GPS proximity between two phones cannot reliably disambiguate "passenger is in the vehicle" from "passenger is standing next to the vehicle" or "passenger's phone is nearby but they haven't actually boarded yet." Sustained proximity alone risks false positives (a passenger who approaches, changes their mind, and leaves) or false negatives (GPS drift near buildings/tunnels).

**Current architecture:** `confirmPassengerAboard` is driver-tap-only; the in-code reasoning explicitly and correctly identifies this ambiguity as the reason it wasn't automated. This is a deliberate, defensible engineering call, not an oversight — but it does directly contradict spec §33's "must not be mandatory."

**Risk:** Building naive proximity-based auto-boarding risks exactly the false-certainty problem spec §7 warns against ("must not claim onboard merely because two GPS points briefly become close").

**Recommended approach:** Treat this as genuinely hard and don't rush it. If automating at all, require *sustained* proximity (e.g., both devices within N meters for M consecutive minutes) AND vehicle movement correlated with the driver's route direction, as a conservative secondary signal alongside the existing manual confirmation — never replacing it, per spec's own "buttons are confirmation, not mandatory" framing (add the automatic path as an *additional* trigger, don't remove the manual one).

**Alternative:** Bluetooth/accelerometer motion-correlation (detecting the passenger's phone accelerating/decelerating in sync with the vehicle) is a materially better signal but is new, non-trivial native infrastructure — not a v1 concern.

### 5.3 Automatic no-show detection (§37)

**Requirement:** No-show should be contextual (pickup time, location, physical proximity), not purely self-reported.

**Why it is difficult:** distinguishing "driver genuinely didn't show" from "driver is 200m away in traffic" requires combining time and location signals, and a false positive (wrongly penalizing someone) carries real reputational cost via the existing automatic 1-star + reliability-penalty consequence.

**Current architecture:** `canReportNoShow` is a pure time gate (≥15 min past `departureAt`) with zero location signal, despite `trips.currentLat/Lng` being fresh and available at report time — the data pipe already exists, unlike §5.1/§5.2.

**Risk:** Currently a live abuse vector: either party can unilaterally trigger an automatic 1-star rating and reliability penalty purely by waiting 15 minutes and tapping report, with no corroborating check.

**Recommended approach:** Low-risk, additive: require both the existing time gate AND a distance-from-pickup-location check (e.g., reject the report if the reporting party's own device is more than N meters from the pickup point, or if the other party's last-known position is within a "clearly en route/arrived" radius) before allowing the report to succeed. This is a bounded, mechanical addition to `canReportNoShow` given the data already exists — the highest-leverage, lowest-risk item in this section.

**Alternative:** None materially better at this stage — automatic (non-self-reported) no-show classification would need the same proximity signal anyway, just triggered by a background job instead of a user tap; not worth building ahead of the corroboration fix above.

### 5.4 Automatic trip start (§35)

**Requirement:** If the driver ignores "Start trip," VAYA should still transition automatically given strong evidence (time, origin proximity, sustained movement).

**Why it is difficult:** Similar ambiguity to boarding detection — a driver stationary near their stated origin might be waiting, not yet departed; movement away from origin could be a detour, not trip start.

**Current architecture:** 100% manual (`startTrip`, driver-tap-only). No automatic fallback exists anywhere.

**Risk:** Because `assertTripNotStarted`'s cancellation guard triggers only on `status !== 'scheduled'`, a driver genuinely en route who hasn't tapped the button can still have their booking cancelled out from under them — the "no cancellation after start" invariant is only as strong as this one manual action.

**Recommended approach:** A conservative combination already has the needed data: scheduled departure time reached AND sustained movement away from origin (using the same GPS feed already broadcasting for tracking) is a reasonable, low-risk auto-start trigger — this is meaningfully easier than boarding detection because it only needs *one* party's signal (the driver's), not a two-party proximity judgment.

**Alternative:** None needed — this is one of the more tractable automatic-inference gaps in the spec.

### 5.5 Automatic completion (§44) — already solved, included for completeness

**Requirement:** Trip completion must not depend on a user tapping "Finish."

**Current architecture:** Already genuinely correct — GPS tight-radius auto-complete plus a BullMQ staleness sweep (reminder at +30min overdue, force-complete at +3h with ≥1h GPS silence), verified race-safe between the two mechanisms. No action needed here; included only to note that this exact pattern (a GPS trigger plus a time-based sweep as a fallback) is the template worth reusing for §5.3 and §5.4 above.

### 5.6 Segment-level capacity and cumulative passenger constraints (§25, §26, §55, §62)

**Requirement:** No route segment ever exceeds physical seats; capacity correctly supports sequential turnover as passengers board/exit at different points.

**Current architecture:** Already genuinely correct at the booking-acceptance layer (§3.3, §2.3) — this is the strongest piece of new infrastructure this audit found relative to the spec's expectations. The only real gap is that *search* doesn't yet consult the same segment-aware model (§2.3, P1 #7) — a self-contained, low-risk fix, not a new capability.

**Recommended approach:** Reuse `wouldExceedCapacity` at search time against the specific candidate segment being searched, replacing the flat `seatsAvailable < 1` filter. No new algorithm needed.

### 5.7 Real-time ETA, cache invalidation, and stale GPS (§17, §29, §62)

**Requirement:** ETAs are honest estimates (estimated/confirmed/inferred/unavailable), never false certainty.

**Current architecture:** Live-tracking ETA recompute is throttled (20s) and real; but pre-departure/`route_passthrough`/`endpoint`-tier ETAs (`pickupEtaSeconds`/`dropoffEtaSeconds`) are computed once, relative to the ride's *originally scheduled* departure time, and never adjusted for the driver's actual real-time progress even where that data exists — latent staleness that today mostly can't manifest only because in-progress rides are excluded from search entirely (§2.1). Redis caching in the routing layer (`lib/routing.ts`, 1hr/60s TTLs) caches routing-provider responses keyed by route request, not candidate pools — every search re-queries Postgres fresh, so cache staleness is not currently a live risk for candidate pooling itself, only latent for the day in-progress matching is built.

**Risk:** The moment in-progress matching (§5.1) ships, this latent ETA staleness becomes live and needs its own fix — factor this into the implementation order rather than treating it as separately schedulable.

### 5.8 Concurrent booking acceptance (§20, §49, §62)

**Requirement:** First accepted request wins atomically; no double-acceptance, no inconsistent retry state.

**Current architecture:** Genuinely well-guarded within the scope it covers — `SELECT...FOR UPDATE` row lock plus a conditional `UPDATE...WHERE status=` guard, consistently applied across accept/cancel/no-show. Verified logically sound for concurrent accepts targeting the same booking/ride. This is a strength, not a risk, within its scope (single-ride). The gap is scope, not correctness: it has no cross-ride mechanism at all (§2.4, P0 #3).

### 5.9 Battery, privacy/permissions, offline/network-loss behavior (§31, §62)

**Requirement:** Operational tracking must respect platform permission/privacy constraints and degrade sanely offline.

**Current architecture:** Foreground-only GPS is the correct, conservative MVP choice given iOS/Android's background-location entitlement and App Store review burden for a carpooling app at this stage — explicitly documented as a stated limitation rather than a silent gap. Genuine risk exists only if/when background tracking is attempted later (battery drain, permission-prompt friction, App Store review scrutiny) — not a present-day concern given the current foreground-only scope. Offline/network-loss behavior for the live-tracking WebSocket has a REST-polling fallback (§3.2) — a reasonable degrade path, though not stress-tested against real network conditions in this environment (same caveat the project's own prior phases have consistently and honestly carried for anything needing live infrastructure).

---

## 6. Recommended Changes

*(Scoped only to items that genuinely require a change — sequencing is in §8, not here.)*

- Design and add a coarse live-corridor concept for `in_progress` rides (§5.1's recommended approach), wired into `matching.service.ts`'s existing tier functions rather than a parallel matching path.
- Extend `computeSuggestedPrice` (or a sibling function) to accept a segment's own distance/duration — reusing the `getRoute` call `previewBookingDetour` already makes — and use it at booking-creation time instead of the flat `ride.contributionPerSeat`.
- Add a journey/request-group key (schema decision required — see §7) and extend `acceptBooking` to look up and cancel sibling pending bookings under the same group, generalizing the existing `FOR UPDATE` discipline to a defined multi-ride lock order.
- Add a real `expiresAt`/deadline column on `bookings`, a sweep job mirroring `trip-staleness-sweep.worker.ts`'s proven pattern, and remove or clearly re-label the client-only countdown until real enforcement exists.
- Add cascade logic to `cancelRide` (bookings→cancelled, trips→cancelled, seats released, notifications fired, conversations closed) mirroring what `cancelBooking` already does correctly at the single-booking level, plus the same `assertTripNotStarted`-style guard `cancelBooking` already enforces.
- Fix `route_passthrough`'s hard stop-requirement — either fold it fully into `detour_match` (which already handles the no-stop case) or relax the requirement with a graceful degrade instead of exclusion.
- Change search's seat-availability pre-filter to consult segment-aware capacity (reusing `computeMaxConcurrentSeats`/`wouldExceedCapacity` against the specific candidate segment) instead of the single bottleneck scalar.
- Add a location/proximity corroboration signal to `canReportNoShow` (§5.3) — low-risk, data already exists.
- Add a conservative automatic trip-start trigger (§5.4) — lower-risk than boarding detection, data already exists.
- Restrict `getTrackingState`'s raw-GPS response to post-boarding (`active`+ statuses), returning only derived info (ETA, "approaching," pickup/route context) pre-boarding, to close the §32 privacy gap.

---

## 7. Questions / Decisions Required

*(Only decisions that cannot safely be inferred from the spec or the codebase.)*

1. **How should "the same passenger journey" be identified across multiple candidate rides?** Options include a client-supplied search/journey id, or a server-derived grouping key from `(riderId, origin, destination, time-window)`. A derived key risks false-grouping two genuinely different requests that happen to look similar; a client-supplied id requires a client contract change. This blocks all of §20/§48/§49.
2. **What live-corridor fidelity should in-progress matching target** — the coarse heuristic in §5.1 (cheap, ships faster, needs real-world false-positive/negative measurement) or full live-corridor recomputation (accurate, materially more expensive/complex)? The spec deliberately leaves this as "an engine concern."
3. **Should driver-selected stops remain fixed literal coordinates, or be reworked into true corridor-intent with per-passenger refinement**, as §5 explicitly describes? A real architecture decision (candidate-stop generation currently bakes in exact coordinates at publish time) with UX and driver-onboarding-flow implications, not a bug fix.
4. **Is the current no-show self-report-plus-automatic-1-star mechanism acceptable with only the proximity corroboration in §5.3 added**, or does it need a stronger dispute-resolution mechanism before this codebase adds further automated-reputation-consequence features on top of it?
5. **Segment-pricing formula**: spec §24 explicitly rules out simple proportional pro-rating ("the full-trip price is an input/reference, not a rigid proportional formula") without specifying what should replace it — a product/pricing call, not purely an engineering one.

---

## 8. Implementation Order

Sequencing follows dependency, not spec section order — several P0 items block or de-risk others:

1. **Decide the journey-grouping data model** (Decision #1) — blocks any correct work on §20/§48/§49; touching `acceptBooking` before this is decided risks a second incompatible half-implementation.
2. **Fix `cancelRide`'s missing cascade + trip-started guard** (P0 #5, P1 #12) — self-contained, addresses a live data-integrity bug, no dependency on anything else.
3. **Fix segment pricing** (P0 #2) — self-contained, reuses existing routing calls, most clearly "just wrong today."
4. **Fix search's stale seat-availability filter** (P1 #7) — self-contained, small, immediately reduces live false-negatives.
5. **Address the fabricated-deadline UI** (P0 #4) — either build minimal real deadline enforcement (mirroring the proven staleness-sweep pattern) or remove the countdown's implied certainty; should not wait on the journey-grouping decision.
6. **Decide and implement the live-corridor / in-progress-matching approach** (Decision #2, P0 #1) — start with §5.1's coarse heuristic; sequence after 1-5 so it isn't built on top of pricing/capacity assumptions that are still wrong.
7. **Build cross-ride first-acceptance-wins** on top of the journey-grouping key from step 1.
8. **Address `route_passthrough`'s stop-requirement bug and the stop-as-fixed-coordinate architecture question** (Decision #3) together, since both concern the same subsystem.
9. **Add no-show proximity corroboration and automatic trip-start** (§5.3, §5.4) — both low-risk, data already exists, can proceed independently of the above.
10. **Restrict pre-boarding raw GPS exposure** (P1 #9) — a scoped, mechanical fix to `getTrackingState`.
11. Remaining P1/P2 items (admin config UI, notification coverage, review UX polish) can proceed in parallel with the above once resourcing allows — none of them block or are blocked by the sequence above.
