# Phase 14 — Intelligent Pickup & Drop-off Engine

**Horizon:** NOW/NEXT · **Estimated complexity:** High

## Objective

VAYA picks the pickup and drop-off itself, for both people. The passenger never chooses a point; the driver never configures exact points beyond their own start and end. A search is never dismissed while a ride could reasonably serve it.

Triggering case (2026-10-15): a published Ksar Said → El Mourouj ride drives through Cité Essalama 2 and along Sidi Hassine, yet a "Sidi Hassine → El Mourouj" search returned nothing — no driver-ticked point near Sidi Hassine, so the pass-through tier had nowhere to board the passenger. Commuters on that corridor (Tunis → Sidi Hassine → Essalama → El Mourouj) are happy to walk a few minutes to the main road; the engine treated "no ticked point" as "no ride".

## The agreed model (product owner, 2026-10-15)

1. **The passenger never picks a point.** VAYA chooses one pickup and one drop-off and the passenger trusts it. They see where it is, how to get there (walking time in town; distance + Google Maps to the exact point intercity) and the price.
2. **At publish, the driver only confirms their own start and end points**, chosen among strategic points VAYA recommends near the origin/destination they typed (already built).
3. **Stops are areas, not points.** When the driver adds a stop, VAYA suggests real places on the route (e.g. Sidi Hassine, Cité Essalama for Ksar Said → El Mourouj), scaled to the trip (neighbourhoods for a city trip, towns/cities intercity). Adding "Sidi Hassine" means "I'm willing to pass by Sidi Hassine" — the driver never ticks exact spots. VAYA computes the exact point per search.
4. **One joint choice per ride.** For each candidate ride VAYA considers several kinds of boarding/alighting point internally — a main-road meeting point on the route, a point in an area the driver added, a short detour to the passenger — scores them on the passenger's access against the driver's extra minutes, and shows only the best pair. Nothing is shown as a list to choose from, to either side.
5. **City vs intercity**, classified on the passenger's own journey:
   - *City / daily commute:* minimum walk + minimum detour. A walk up to **20 minutes** to the main road is acceptable and shown in minutes.
   - *Intercity:* the passenger may take public transport or a taxi to a good pickup. Show distance, never a walking time, and a Google Maps link to the exact point.
6. **The driver's request says everything:** who, seats, exactly where the pickup and drop-off are, extra minutes, price. The driver accepts or declines; they don't edit points.
7. **Only physical impossibility dismisses a ride:** wrong direction, no seat on the passenger's segment, already departed, or out of reach even with an allowed detour.

**Decision recorded as default, pending explicit confirmation:** a driver-added area is a **preference, not a restriction** — pickups near it rank higher and may use a larger detour allowance, but a passenger elsewhere along the route still matches when walk and detour are small. A restriction would reintroduce dismissed searches.

## What exists and must be reused, not rebuilt

- `matching.service.ts`: `resolvePassengerSegment(WithinReach)`, `pickRecommendedStopId` / `@vaya/domain` `joint-stop-score.ts` (M-039 joint walk/detour score), `onRoutePointOption` (the on-route fallback added 2026-10-15 — the interim version of Track C), the detour tier's real routing call.
- `@vaya/domain` `passenger-access.ts` (walk caps, `describePassengerAccess`), `classifyTripProfile`, `getMatchingThresholds`, `detourAllowanceSec`.
- `city-detour-candidates.service.ts` (named places along a route: Overpass → Google Nearby → on-route micro-stops) — the basis of Track D's area suggestions.
- `bookings.service.ts`'s `assertRealDetourWithinAllowance` / `computeDetourImpact` — server-side validation of any non-stop point, unchanged.
- Driver request UI (`RequestDetailSheet`, `GET /bookings/:id/detour-preview`) — already shows map, detour and price in-app.

## Status (2026-10-15) — done

- **Track A — done.** Maps directions links built by hand with literal commas (`googleMapsLink.ts`) — `URLSearchParams` encoded them as `%2C`, the likely cause of the Android tablet opening Maps with no destination. **Deviation:** no separate Android Maps-app intent was added; Google's documented `maps/dir/?api=1` URL already opens the Maps app when installed, and a `geo:` intent would drop a pin instead of giving directions. Re-check on the tablet before adding one. City walk cap 15 → 20 min (`MAX_CITY_WALK_MINUTES`).
- **Track B — done.** `buildBookingPoints` books the server's pair; the pickup/dropoff picker screens, the long-press override and their search state are deleted. Driver push: "Amira · 1 place" / "Sidi Hassine → El Mourouj / +3 min de détour · 4,5 DT" with the passenger photo (`richContent.image`; Android shows it, iOS needs a Notification Service Extension — not built). The `booking_requested` payload also carries `contributionTotal`, `detourExtraSeconds`, `expiresAt`, ride endpoint labels and `segmentStart/EndFraction`.
- **Inbox redesign — done** (asked for alongside Track B): open requests first as tickets (photo + rating, countdown to the real deadline, the passenger's leg on the driver's ride, detour/earnings/seats/departure, Accept/Decline after checking the booking's real status), the rest as a day-grouped activity timeline with filters. New primitives `ActivityRow`, `RouteSegmentBar`, `CountdownRing`, `FactRow`.
- **Track C — done.** The detour tier runs on every search (routes only rides other tiers didn't match; 5 parallel routing calls when they did, 15 otherwise) and joins the same ranking. Every search logs one `matching.search` line: rides kept, and per ride every tier's dismissal reason (`DismissalLog`; places rounded to ~1 km). **Scored bands:** the remaining cut-offs are now only physical impossibility — wrong direction, no seat on the segment, beyond extended reach *and* beyond the detour allowance; everything between walking reach and extended reach is shown as a lower band, and anything a short detour can reach is offered as a detour match.
- **Track D — done.**
  - `meeting_points` table (migration `0033`): petrol/louage/metro/bus stations, bus stops, roundabouts, highway exits, collected from OpenStreetMap (Overpass) within 250 m of every newly published route by a `meeting-point-scan` job on the one existing queue (`meeting-points.service.ts`), classified ("Station louage" = an `amenity=bus_station` named for louages), labelled, road-snapped (skipped if >120 m away), upserted by OSM id. Google Places was not added as a second source: Overpass is keyless and returns the place kinds directly.
  - `@vaya/domain` `meeting-point-score.ts`: one cost in seconds = passenger access (a walk in town; a walk or a taxi/louage ride intercity) × weight + driver detour × weight + a credit for recognizable places, for places people used (Track E) and for places inside a driver area. Matching's roadside choice (`onRoutePointOption`) scores every meeting point within reach and within the corridor plus the bare on-route point, and offers the cheapest; candidates carry `meetingPointId`/`placeKind`.
  - Driver stops are areas: the app adds stops with `role: 'area'` (`route_stops.kind = 'area'`, `radius_m` 1.5/2.5/6 km by ride length), never road-snapped, never bookable by id (`createBooking` rejects them); they only credit meeting points inside them. `role: 'via'` stays a bookable point for app versions that send it (the existing e2e journeys rely on it). The publish wizard lists only areas, with copy saying VAYA picks the exact point. Ride details names the kind of place ("Station-service · 6 min…") and shows an area as "Le conducteur passe par ici".
- **Track E — done** (tuning itself follows real data). Bookings record the meeting point they used (`pickup/dropoff_meeting_point_id`, accepted only within 60 m of the booked coordinates); every completed trip (manual, GPS auto-completion, staleness sweep — one shared side-effect path) adds one use. The five weights are on the admin Operational config page (`meeting*` columns, null = domain default). Admin analytics "Pickup places — request outcomes" shows acceptance by kind of place and the most-used points (`GET /admin/analytics/pickup-outcomes`).

**Verified here:** domain 267/267, validation 14/14, admin 11/11, design-system 150/151 and mobile 318/323 (the 6 failures are the pre-existing date-dependent snapshots, identical on the pre-phase commit); API 538/545 against real Postgres/PostGIS/Redis (the 7 failures need Google OAuth or live OSRM/geocoding); typecheck + lint clean across the repo (api-client after generating its types from the running API). E2E (`tests/e2e`, live server): identical to the pre-phase commit — 9 pass, 14 need a live routing engine — plus the new Journey 12, which skips here for the same reason. New tests: `meeting-point-score`, `matching.service` (meeting points, areas, the Ksar Said corridor), `meeting-points` (classification, labels, scan boxes), `meeting-points-scan` / `driver-areas` / `meeting-points-learning` / `matching-detour-alongside` integration suites, `inboxModel`, `bookingPoints`, inbox primitives.

**Not verified here:** Overpass is unreachable from this sandbox (proxy 403), so no real Tunisian meeting point has been collected yet — the scan is tested against stubbed Overpass responses; it fills in once deployed and rides are published. No routing engine either, so Journey 12 and the booking half of the flow were not run end to end. Nothing was run on a device (push image, inbox, publish areas step, ride details); the inbox was checked in the web build in light and dark.

## Exact scope, in order

### Track A — Quick fixes
- Google Maps button: reported opening Google Maps with no destination on an Android tablet. Build the URL by hand (literal commas, no `URLSearchParams` dependency) and on Android open the Maps app directly with coordinates, falling back to the web URL.
- City walk cap 15 → 20 minutes (`MAX_CITY_WALK_MINUTES`), with the matching copy.

### Track B — The passenger never chooses
- Remove the stop-picker hand-off from `search/ride-details.tsx` (`needsPickupSelection`/`needsDropoffSelection`) and the long-press override from the passenger flow; the booking sends the server's resolved pair (`pickupPoint`/`dropoffPoint`) exactly as displayed.
- `search/pickup-point.tsx` / `dropoff-point.tsx` become read-only "where you'll meet" views or are deleted — whichever leaves no dead route.
- Driver push + inbox copy for `booking_requested`: seats, pickup place, extra minutes, price (e.g. "Ahmed · 1 place · prise en charge Sidi Hassine (sortie X20) · +3 min · 4,5 DT"). Every value from the real booking/detour data, never estimated client-side.

### Track C — Never dismiss a servable search
- Run the detour tier alongside Stage A (cost-capped as today) instead of only when Stage A is empty, merged into one ranking.
- Replace the remaining hard cut-offs with scored bands; dismiss only for the reasons in model rule 7.
- Log a dismissal reason per (search, ride) pair — the only way to measure the engine later.

### Track D — Tunisian meeting points and areas
- A meeting-point layer: places a car can actually stop on main roads — metro/bus/louage stations, petrol stations, main roundabouts, highway exits — seeded from Google Places/Overpass, snapped to a non-motorway drivable road. Replaces the raw on-route projection in `onRoutePointOption`.
- Publish: "add a stop" suggests areas on the route via `city-detour-candidates`, scaled by trip profile; selecting one stores an area (label + centre + radius), not a bookable point. Additive schema only (e.g. a `kind` on `route_stops` or a new table) — existing rides with point stops keep working.
- Per search, the joint score (`joint-stop-score.ts`) runs over meeting points + area-derived points + short detour, with city/intercity weights.

### Track E — Learn from outcomes
- Use accepted/declined requests and where pickups actually happened (live tracking) to tune walk/detour weights and promote the meeting points people really use. Admin-tunable through the existing operational config.

## Business rules

- Server-authoritative: every point offered is computed by the server and re-validated at booking (`assertRealDetourWithinAllowance`); price comes from the existing pricing engine for the passenger's segment.
- Never fabricate: walking time only where walking is the realistic mode; otherwise distance. No ETA or detour number without a real route behind it.
- Additive data changes only (CLAUDE.md: rides published before this phase keep working).

## Testing

Unit tests for every scoring/selection function (pure, in `packages/domain` where possible); the Ksar Said → El Mourouj corridor as a fixture (Sidi Hassine → El Mourouj, Essalama 2 → Sidi Hassine, reversed direction, city vs intercity); integration tests for booking with a server-resolved point; an E2E addition to `tests/e2e` for search → book without any passenger point selection.

## Definition of Done

- [x] Track A–D shipped; Track E's logging in place (tuning itself follows real data).
- [x] No passenger-facing point selection remains anywhere.
- [x] Driver request (push, inbox, sheet) shows where, extra minutes and price from real data.
- [x] The triggering searches return the ride with a sensible main-road pickup (Sidi Hassine → El Mourouj boards at the roadside petrol station in `meeting-points-scan.integration.test.ts`; Essalama 2 → Sidi Hassine on the route in `matching.service.test.ts`).
- [x] `pnpm test`, `typecheck`, `lint` pass (environment-only failures listed above); status table and CLAUDE.md updated.

## Risks / non-goals

- Meeting-point data quality in Tunisia is uneven; start with the Greater Tunis corridors and grow from usage (Track E), not a national hand-curated catalogue.
- Not in scope: multi-driver transfers, live re-pickup negotiation, payments.
