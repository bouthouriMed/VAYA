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

## Status (2026-10-15)

- **Track A — done.** Maps link built with literal commas (`googleMapsLink.ts`); city walk cap 20 min.
- **Track B — done.** `buildBookingPoints` books the server's pair; pickup/dropoff picker screens, the long-press override and their search state are deleted. Driver push: "Amira · 1 place" / "Sidi Hassine → El Mourouj / +3 min de détour · 4,5 DT" with the passenger photo (`richContent.image`; Android shows it, iOS needs a Notification Service Extension — not built). The `booking_requested` payload also carries `contributionTotal`, `detourExtraSeconds`, `expiresAt`, ride endpoint labels and `segmentStart/EndFraction`.
- **Inbox redesign — done** (not in the original scope, asked for alongside Track B): open requests first as tickets (photo + rating, countdown to the real deadline, the passenger's leg on the driver's ride, detour/earnings/seats/departure, Accept/Decline after checking the booking's real status), the rest as a day-grouped activity timeline with filters. New primitives `ActivityRow`, `RouteSegmentBar`, `CountdownRing`, `FactRow`.
- Tracks C–E: not started.

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

- [ ] Track A–D shipped; Track E's logging in place (tuning itself follows real data).
- [ ] No passenger-facing point selection remains anywhere.
- [ ] Driver request (push, inbox, sheet) shows where, extra minutes and price from real data.
- [ ] The triggering searches return the ride with a sensible main-road pickup.
- [ ] `pnpm test`, `typecheck`, `lint` pass; status table and CLAUDE.md updated.

## Risks / non-goals

- Meeting-point data quality in Tunisia is uneven; start with the Greater Tunis corridors and grow from usage (Track E), not a national hand-curated catalogue.
- Not in scope: multi-driver transfers, live re-pickup negotiation, payments.
