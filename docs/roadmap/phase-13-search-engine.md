# Phase 13 — World-Class Search & Matching Engine

**Horizon:** NOW/NEXT · **Estimated complexity:** High

## Objective

Turn `matching.service.ts` from "a good radius-and-time matcher over a ride's two endpoints" into VAYA's actual core differentiator: a route-aware matching engine that finds real usable rides the way BlaBlaCar does — by whether a driver's route *passes through* a rider's corridor, not just whether the ride's origin/destination happen to sit near the rider's. Two concrete gaps drive this phase, both explicitly called out by the user:

1. **Search is endpoint-only today.** `scoreCandidates`'s candidate filter (`matching.service.ts:179-187`) only tests the rider's origin/destination against `ride.originLat/Lng`/`ride.destinationLat/Lng`. A Tunis→Sfax ride with a real driver-selected stop at Hammamet is *invisible* to a Hammamet→Sousse (or even a Hammamet→Sfax) search — the exact "picks up/drops off along the way" mechanic that is BlaBlaCar's core value is structurally impossible in the current query. `route_stops`/`routePolyline` are only ever used *after* a ride already passed the endpoint filter (for pickup ranking), never to *find* a ride in the first place.
2. **A search with no results today just... has no results.** `corridorFallback` widens radius and time window once, and if that's still empty, the only affordance is "notify me" with zero rides shown. There's no "your exact time isn't available, but here's the closest departure on this route" — a real, common case (BlaBlaCar's actual UX default) — and no route-level pass-through fallback either.

**Product framing (CLAUDE.md principle):** "the system should always optimize toward showing *some* rides, better than nothing — nothing is acceptable only in genuinely extreme cases (no ride exists on this corridor at all within a reasonable lookahead)." This phase makes that a real, tiered, honestly-labeled cascade, not a UI-level illusion.

## Prerequisites

Phase 4/5 (Ride Engine — `route_stops`, `routePolyline`, `rankStopsByWalkDistance`/`pickupViable`, all reused directly, not rebuilt). Phase 6 (Pricing — untouched, but every new tier still returns `contributionPerSeat` as-is). Verify via `docs/roadmap/README.md`'s status table before starting — all are already Done.

## What already exists and must be reused, not rebuilt

- `lib/geo.ts`'s `haversineDistanceMeters`, `lib/polyline.ts`'s `decodePolyline`/`resamplePolyline`/`computeRouteOverlapFraction` — the geometric primitives this phase's new `projectPointOntoRoute` sits alongside.
- `matching.service.ts`'s `rankStopsByWalkDistance`/`isPickupViable` — Track B mirrors these exactly for dropoff, doesn't reinvent them.
- The tight/wide radius+time constant pattern (`TIGHT_*`/`WIDE_*`) — new tiers add to this ladder, they don't replace it.
- `demand_signals` + `POST /matching/notify-me` — the true "nothing at all" terminal case, unchanged.

## Architecture: the tier cascade

`searchRides` becomes the single entry point mobile calls (Track C retires the second `corridor-fallback` round-trip). Internally it tries tiers in order, stopping at the first with at least one result:

| Tier | Spatial test | Time test | What it means to the rider |
|---|---|---|---|
| `exact` | tight radius vs ride endpoints (existing) | tight window (±90min) | A ride genuinely starts/ends near you, near your time. |
| `wide_corridor` | wide radius vs ride endpoints (existing) | wide window (±240min) | Same idea, looser — existing `corridorFallback` behavior, now inline. |
| `route_passthrough` | rider origin AND destination both project onto the ride's **polyline** within a corridor width, in the correct order (**NEW — Track A**) | wide window (±240min) | The driver isn't starting or ending at your points, but their route runs right through your corridor — the actual BlaBlaCar mechanic. |
| `closest_departure` | wide radius vs ride endpoints (reuses the wide spatial test) | **no window** — next N departures within a 14-day lookahead, sorted by proximity to requested time (**NEW — Track A2**) | "Nothing at your requested time, but here's the closest we've got on this route." |
| `none` | — | — | Genuinely nothing on this corridor within 14 days. Only case where zero rides is correct, not a search failure — falls through to the existing `notify-me` demand-signal flow unchanged. |

Each tier's response carries `tier` and a server-built `message` (French, matching this codebase's existing copy conventions) so mobile never re-derives "why are these the results" copy per tier — same reasoning as `notificationCopy.ts` mirroring `bodyFor()` for a different feature.

### Track A — Route pass-through matching (the core fix)

New pure function in `lib/polyline.ts`:

```ts
export function projectPointOntoRoute(point: LatLng, route: LatLng[]): {
  distanceM: number;       // perpendicular-ish distance to the nearest point on the route
  fraction: number;        // 0..1, position along the route by cumulative distance
  nearestPoint: LatLng;
}
```

Implemented by resampling the route densely (reusing `resamplePolyline`) and taking the closest sample, recording its cumulative-distance fraction — the same "dense sample + nearest vertex" approximation `computeRouteOverlapFraction` already uses at this corridor scale, not a new geometric approach.

`matching.service.ts` gains `scorePassThroughCandidates`: for rides whose *endpoints* fail the wide radius test, project both the rider's origin and destination onto `decodePolyline(ride.routePolyline)`. A ride qualifies when: both project within `OVERLAP_CORRIDOR_WIDTH_M` of the route, `originFraction < destinationFraction - MIN_FRACTION_GAP` (direction-correct, not a near-identical point), and the ride has at least one usable stop near each side (see Track B — a pass-through match is only ever `pickupViable`/`dropoffViable` through a real `route_stop`, never a raw polyline point, because CLAUDE.md's product principle #1 forbids free-form pickup and this phase does not relax that for dropoff either). Rides with no `routePolyline` (haversine-fallback rides) are skipped for this tier — honest, not faked from a straight line.

Score these lower than an endpoint match by construction (the existing `score` formula's pickup/dropoff-distance terms naturally do this once fed the *projected* distances instead of raw endpoint distances) plus a small penalty proportional to how much of the ride's route is *outside* the rider's requested segment (a very long ride for a short hop scores lower than a ride whose length roughly matches the request) — mirrors BlaBlaCar's own "detour cost" intuition without inventing a new scoring axis; reuses the existing `score`/`reasons` shape unchanged so mobile's card rendering needs no new fields.

### Track A2 — Closest-departure fallback

New `findClosestDepartures(db, input, limit)`: same wide-radius endpoint spatial test as `wide_corridor`, but the time filter is a 14-day lookahead ordered by `ABS(departureAt - input.when)` instead of a fixed window, capped to `limit` (proposed 5). This is deliberately the *last* tier before `none` — it only fires when even route pass-through found nothing, since a same-route-different-time ride is a weaker substitute than a same-time-different-route(-segment) one.

## Database

**Migration `0013_*` (additive only):**
- `bookings.dropoff_stop_id uuid references route_stops(id) on delete set null` — mirrors `pickup_stop_id` exactly.
- `bookings.dropoff_label varchar(140)`, `dropoff_lat/lng double precision` — nullable (unlike the `NOT NULL` pickup columns): a ride with no dropoff-stop selection keeps dropping the rider at the ride's own `destinationLabel/Lat/Lng`, so these columns are genuinely optional, not "not yet populated." Populated at booking time exactly like pickup when `dropoffStopId` is supplied.

No changes to `rides`/`route_stops`/`demand_signals`.

## API

- `GET /matching/search` — same query params, response shape gains `tier` (enum above) and `message: string | null`. `GET /matching/corridor-fallback` is **removed** — Track C's whole point is one round trip; verify zero other callers before deleting (checked: only `search/results.tsx` calls it).
- `POST /bookings` — gains optional `dropoffStopId`, validated exactly like the existing `pickupStopId` path in `bookings.service.ts`'s `createBooking`: must belong to the same ride, must be `is_driver_selected`, must have `sequence` strictly after the chosen `pickupStopId`'s sequence (a dropoff before your own pickup is nonsensical — new check, not mirrored from pickup since pickup has no "before" concept to guard against). Omitted → ride's own destination, unchanged legacy behavior.
- `MatchCandidate` gains `rankedDropoffStops: RankedStop[]` and `dropoffViable: boolean`, computed via `rankStopsByWalkDistance(destination, ...)` / a new `isDropoffViable` mirroring `isPickupViable` bit-for-bit.

## Business rules

- A pass-through match is only surfaced as bookable (both `pickupViable` and `dropoffViable` true) when real `route_stops` cover both ends within range — never a raw polyline point standing in for an unvalidated pickup/dropoff (extends product principle #1 to dropoff, which had no equivalent guard before this phase since dropoff was always just "the ride's destination").
- Tier order is fixed and server-side; mobile never chooses which tier to query — one request, one authoritative answer, so two different screens can never show inconsistent "why these results" reasoning.
- `closest_departure`'s 14-day lookahead is a named constant (`CLOSEST_DEPARTURE_LOOKAHEAD_DAYS`), not implicitly infinite — searching "next available ever" without a bound risks surfacing a ride so far out it's not actually useful, and is an unbounded query besides.
- `route_passthrough` tier never fires for a ride without a real OSRM-derived `routePolyline` — a haversine-fallback ride has no route geometry to project onto, and fabricating one from a straight line would misrepresent the driver's actual path.

## Mobile

`search/results.tsx`: drop the second `useCorridorFallbackQuery` hook entirely; one `useMatchingSearchQuery` call now returns `{tier, candidates, message}`. Banner copy comes from the server `message` field (replacing the current ad-hoc client-side time-diff heuristic that builds the "approx" banner text locally) plus a tier-specific icon/tone (`route_passthrough` gets a distinct "Sur votre trajet" badge on its cards via `DriverListCard`, since a pass-through ride is a genuinely different kind of result the rider should understand at a glance — not just a lower score).

Booking flow: `search/pickup-point.tsx` is generalized to a shared stop-selection screen parametrized by `mode: 'pickup' | 'dropoff'` (same map/list/BottomSheet chrome, different ranked-stop list and a new `searchSlice.dropoffStop` mirroring the existing `pickupStop`) rather than a second near-duplicate screen. `useOpenDriver` routes through pickup-selection → dropoff-selection (only when `candidate.rankedDropoffStops.length > 0`, i.e. skip entirely for the common non-pass-through case where dropoff is just the ride's destination) → ride-details, same chained-params pattern Phase 5 established.

## Testing

- Pure unit tests: `projectPointOntoRoute` (on-route point, off-corridor point, direction ordering, degenerate 1-point/empty route), `scorePassThroughCandidates`'s qualification logic, `isDropoffViable`, `findClosestDepartures`'s ordering.
- Integration (real Postgres + real OSRM, mirroring Phase 4/5's discipline): a genuine 3-tier fixture — a ride whose endpoints match exactly (`exact`), a ride only reachable by widening (`wide_corridor`), a long intercity ride with a mid-route stop pair matching a short sub-trip search (`route_passthrough`), and a corridor with only a differently-timed ride (`closest_departure`) — asserting the endpoint returns the right tier and never silently returns `none` when any tier has data.
- E2E: extend `tests/e2e`'s core-loop suite with a pass-through booking (search finds a `route_passthrough` result → select pickup stop → select dropoff stop → book) alongside the existing legacy/no-stops case.

## Definition of Done

- `pnpm test`/`typecheck`/`lint` pass across `apps/api`, `apps/mobile`, `packages/*`.
- A search with zero `exact`/`wide_corridor` results but a real pass-through ride on the corridor returns it, tier-labeled, not silently empty.
- A search with zero rides at the requested time but a same-corridor ride at another time within 14 days returns it as `closest_departure`, never falls straight to the empty state.
- No screen renders a fabricated pickup/dropoff — pass-through results are only bookable through real `route_stops`.
- Roadmap status table and this file's "implementation notes" are updated in the same change that completes the phase (per CLAUDE.md's Phase execution rules).

## Risks / explicit non-goals (don't scope-creep into these)

- **Multi-leg / transfer matching** (combine two different drivers' rides to cover one trip) is explicitly out of scope — real value, much bigger mechanism (booking-linking, transfer-point UX), a future phase's problem.
- **Partial-direction matching** (driver going roughly your way but not covering your whole segment, or only your origin *or* destination corridor, not both) is explicitly deferred — no good "book" action exists for it without more product design than this phase should absorb; the tier cascade above already turns "truly empty" into a rare edge case without it.
- Do not touch `pricing_configs`/`computeSuggestedPrice` — a pass-through booking's price is still `contributionPerSeat` for the seats requested, unchanged; per-segment pricing is a real future idea but not this phase's job.
