# Target Domain Model

This documents the **existing** schema (verified directly against `apps/api/src/db/schema/*.ts`, not inferred) plus the **additions** needed to close the gaps identified in `docs/product/audit.md`. The existing schema is more complete than a typical MVP — treat additions as extensions, not a redesign.

## Existing entities (verified against source)

### `users`
`id, phone (unique), fullName, avatarUrl, locale (fr|ar|en, default fr), createdAt, updatedAt`. Auth-adjacent: `otp_codes` (phone/code/expiresAt/consumedAt), `refresh_tokens` (userId, tokenHash, expiresAt, revokedAt). **Source of truth for identity.**

### `driver_profiles`
`id, userId (unique FK→users), verificationStatus (pending|approved|rejected), bio, ratingAvg, tripCount, punctualityScore, reliabilityScore, approvedAt`. One-to-one with `users`. **Source of truth for a user's standing as a driver** — `ratingAvg`/`reliabilityScore` are read directly by `matching.service.ts` to build match "reasons" (e.g. "Conducteur très fiable" when `reliabilityScore >= 0.9`).

### `vehicles`
`id, driverProfileId (FK), make, model, color, plateNumber, seatCount, photoUrl`. One driver can have multiple vehicles; a `ride` references exactly one.

### `verification_documents`
Driver KYC documents (license, insurance, selfie match) backing `driverProfiles.verificationStatus`. Feeds the live-camera onboarding wizard (`docs/product/audit.md` §4) — the most production-grade flow in the app today.

### `routes`
`id, originLabel/Lat/Lng, originAreaRadiusM (default 1500), destinationLabel/Lat/Lng, destinationAreaRadiusM (default 1500), distanceKm, estimatedDurationMin, minContribution, recommendedContribution, maxContribution`. **Currently a static, seeded catalog of known origin↔destination pairs with hand-authored price bounds** — not computed. This is the anchor point for `docs/domain/pricing.md`.

### `rides`
`id, driverProfileId, vehicleId, routeId (nullable FK→routes), originLabel/Lat/Lng, destinationLabel/Lat/Lng, departureAt, seatsTotal, seatsAvailable, contributionPerSeat, status (draft|published|full|in_progress|completed|cancelled), routePolyline, estimatedDurationSec, recurringPatternId (nullable FK)`. **Source of truth for a single published trip offer.** `routePolyline` is real OSRM-derived geometry (`lib/routing.ts`) — this is what powers `computeRouteOverlapFraction` in matching. **No stops/waypoints column exists** — a ride is strictly one origin, one destination today.

### `bookings`
`id, rideId (FK, cascade), riderId (FK→users), seatsRequested, contributionTotal, status (pending|accepted|declined|cancelled_by_rider|cancelled_by_driver|expired|completed|no_show), pickupLabel/Lat/Lng, requestedAt, respondedAt`. **Source of truth for a passenger's request against a ride.** Note `pickupLat/Lng` is a free-standing point today, not a reference to any stop entity on the ride — this is exactly the gap `docs/domain/ride-engine.md` closes.

### `trips`
`id, bookingId (unique FK→bookings), rideId (FK), status (scheduled|driver_approaching|pickup|active|arriving|completed|no_show|cancelled), simulationStartedAt, pickupConfirmedAt, dropoffAt, riderSettlementConfirmedAt, driverSettlementConfirmedAt`. **Source of truth for trip-day execution state**, one row per accepted booking. This is what `bookings/pending.tsx` through `settlement.tsx` should be rendering — the audit found they currently render mock data instead (`docs/product/audit.md` §4).

### `ratings`
`id, tripId (FK), raterUserId, rateeUserId, role (rider_rates_driver|driver_rates_rider), stars, punctualityFlag, comment`. Feeds back into `driverProfiles.ratingAvg`/`punctualityScore` (aggregation mechanism not located in this pass — verify during the Ratings & Trust phase). Symmetric rider↔driver rating, matching the benchmark's mutual-rating model.

### `notifications`
`id, userId, type (booking_requested|booking_accepted|booking_declined|trip_driver_approaching|trip_completed|recurring_pattern_detected|recurring_proactive_match|demand_signal_matched), payload (jsonb), readAt`. **The event taxonomy already anticipates recurring-ride and demand-signal notifications** — the schema was designed ahead of the features that would populate it. Columns unchanged since the original audit. **As of Phase 7 (`docs/roadmap/phase-07-notifications.md`), a real dispatch mechanism exists**: a row created for `booking_requested`/`booking_accepted`/`booking_declined` (the only 3 types wired up so far) enqueues a BullMQ job that pushes to the user's registered `device_tokens` via Expo's push API. The other 5 event types remain schema-only, populated by nothing yet — future phases (Recurring Rides, demand signals) wire those.

### `device_tokens` (new — Phase 7)
`id, userId (FK→users, cascade), token (globally unique), platform (ios|android), createdAt, updatedAt`. One row per (user, device) — a device's Expo push token. A re-registration (reinstall, refreshed token, or the same device logging into a different account) updates the existing row in place rather than accumulating duplicates, since `token` uniquely identifies one current installation. Written via `POST /users/me/push-token`; read by the notification-dispatch worker (`apps/api/src/modules/notifications`) to know where to push.

### `demand_signals`
`id, userId, originLabel/Lat/Lng, destinationLabel/Lat/Lng, desiredWindowStart/End, status (open|notified|expired)`. Backs the "notify me" fallback in `results.tsx` — created via `createDemandSignal`, read by `corridorFallback` in `matching.service.ts` to count unmet demand near a searched corridor. **Source of truth for unmatched passenger intent** — valuable signal for where to seed driver supply (see `docs/product/benchmark.md` §6 cold-start).

### `recurring_patterns`
`id, userId, role (rider|driver), routeId (nullable), originLabel/Lat/Lng, destinationLabel/Lat/Lng, daysOfWeekMask, timeWindowStart/End, timeWindowEnd, confidenceScore, status (detected|suggested|enabled|dismissed), lastMatchedAt`. **Schema already models commute-pattern detection** (`detected`→`suggested`→`enabled` lifecycle, `confidenceScore`) — this is the Karos/Klaxit-style repeat-route mechanism from the benchmark (`docs/product/benchmark.md` §7), already anticipated in the data model but with no UI or detection job built yet.

### `relationship_signals`
`id, userAId, userBId, tripsTogetherCount, lastTripAt`. Explicitly commented in source: *"Factual co-travel history between two users. Never implies a personal relationship."* A trust/familiarity signal (has this passenger ridden with this driver before) beyond what BlaBlaCar's public documentation describes — an intentional VAYA-specific addition, keep it.

## New entities required

### `route_stops` (new — for `docs/domain/ride-engine.md`)
Candidate pickup/drop-off points along a ride's actual road route. One ride has many stops; a booking references a specific stop instead of a free-standing lat/lng. See `docs/domain/ride-engine.md` for the full field list, generation algorithm, and ranking logic.

### `pricing_configs` (new — for `docs/domain/pricing.md`)
Per-region or per-route-class configuration for the price-per-km formula and bound multipliers, replacing the current hardcoded values in `seed.ts`. See `docs/domain/pricing.md`.

### `conversations` / `messages` (Phase 8 — `docs/roadmap/phase-08-messaging.md`)
`conversations`: `id, bookingId (unique FK→bookings), status (open|closed), createdAt, updatedAt`. `messages`: `id, conversationId (FK→conversations), senderUserId (FK→users), body (varchar 1000), createdAt`, indexed on `(conversationId, createdAt)` for the polling read. One conversation per booking — not per ride, not general social chat — auto-created the moment a booking reaches `accepted` (`conversations.service.ts`'s `createConversationBestEffort`, hooked into `bookings.service.ts`'s `acceptBooking`). Becomes permanently read-only once the booking's `trip` reaches a terminal status (`completed`/`no_show`/`cancelled`, per the Trip status machine below) — enforced live against `trips.status` on every read/write, not from the cached `conversations.status` column alone, since this codebase has no trip-completion endpoint yet and the column would otherwise go stale. Only the booking's two parties (driver, rider) may read or write, checked on every request.

## Modifications to existing tables

- `bookings.pickupLat/Lng` → add `pickupStopId` (nullable FK→`route_stops`) once the ride engine ships; keep the raw lat/lng columns for backward compatibility and for rides published before the ride engine (see rollout note in `docs/domain/ride-engine.md`).
- `rides` → add indexes on `status`, `departureAt` (composite with `status` for the matching hot-path query), and all FK columns (`driverProfileId`, `vehicleId`, `routeId`) — currently missing entirely (`docs/product/audit.md` §3).
- `bookings.acceptBooking` service logic → wrap the seats-available check and decrement in a single transaction with row locking (`SELECT ... FOR UPDATE` or an atomic conditional `UPDATE ... WHERE seats_available >= :requested`) to close the confirmed overbooking race.

## State machines (authoritative, already correctly located in `packages/domain`)

- **Ride status**: `draft → published → full ⇄ published → in_progress → completed`, with `cancelled` reachable from `draft`/`published`/`full`. Defined in `packages/domain/src/ride` (`canTransitionRideStatus`), consumed by `rides.service.ts` — **keep this as the single source of truth**, do not duplicate transition logic in the API layer or mobile app.
- **Booking status**: `pending → accepted|declined`, `accepted → cancelled_by_rider|cancelled_by_driver|completed|no_show`, `pending → expired`. Defined in `packages/domain/src/booking` (`BOOKING_STATUS_TRANSITIONS`), consumed by `bookings.service.ts`.
- **Trip status**: `scheduled → driver_approaching → pickup → active → arriving → completed`, with `no_show`/`cancelled` as alternate terminal states. Transition logic location not confirmed in this pass — verify it lives in `packages/domain/src/trip` before extending; if it's currently implicit in `apps/api`, that's a rule violation to fix opportunistically.
- **Recurring pattern status**: `detected → suggested → enabled`, or `dismissed` at any point. No consuming logic found yet — this is scaffolding for the Recurring Rides phase.
- **Verification status**: `pending → approved|rejected`, on `driver_profiles`.

## Source-of-truth summary

| Concern | Authoritative table |
|---|---|
| Identity | `users` |
| Driver standing/trust score | `driver_profiles` |
| A published trip offer | `rides` |
| A passenger's request | `bookings` |
| Trip-day execution state | `trips` |
| Post-trip reputation | `ratings` (aggregated into `driver_profiles`) |
| Unmet demand | `demand_signals` |
| Commute pattern | `recurring_patterns` |
| Familiarity between two users | `relationship_signals` |
| Candidate stops on a route (new) | `route_stops` |
| Price bounds (new) | `pricing_configs` |
| A device's push token (new, Phase 7) | `device_tokens` |
| A booking's driver↔rider conversation (new, Phase 8) | `conversations` / `messages` |
