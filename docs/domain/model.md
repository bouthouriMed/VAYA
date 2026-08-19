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
`id, bookingId (unique FK→bookings), rideId (FK), status (scheduled|driver_approaching|pickup|active|arriving|completed|no_show|cancelled), simulationStartedAt, pickupConfirmedAt, dropoffAt, completedAt (new — Phase 9), riderSettlementConfirmedAt, driverSettlementConfirmedAt`. **Source of truth for trip-day execution state**, one row per accepted booking. This is what `bookings/pending.tsx` through `settlement.tsx` render (Phase 1 wired the screens to real data; Phase 9 added the actual `completed` transition — see below). `completedAt` (nullable timestamp, additive) is set the moment a trip reaches `completed` and anchors the 24h rating-submission window (`packages/domain/src/rating/rating-window.ts`).

**Phase 9 addition — trip completion**: before Phase 9, nothing in this codebase ever transitioned a trip to `completed` (verified directly: no caller of `canTransitionTripStatus` existed outside `packages/domain`'s own tests). `POST /trips/:id/complete` (`apps/api/src/modules/trips`) is the minimal trigger added to unblock ratings — callable by either trip party (not driver-only: this app has no driver-side trip-execution screen yet), transitioning via `packages/domain`'s state machine, which now allows `completed` directly from every non-terminal status, not only `arriving` (the mobile trip-progress flow is still a presentational mock with no live position feed driving it through the intermediate statuses one at a time). Completion also transitions the associated `booking.status` to `completed` (another schema-modeled-but-previously-unset value) and recomputes both parties' `tripCount` directly from `trips` rows.

### `ratings`
`id, tripId (FK), raterUserId, rateeUserId, role (rider_rates_driver|driver_rates_rider), stars, punctualityFlag, comment`. Feeds back into `driverProfiles.ratingAvg`/`punctualityScore` and (Phase 9, new) `riderProfiles.ratingAvg`/`punctualityScore`. Symmetric rider↔driver rating, matching the benchmark's mutual-rating model. **Aggregation mechanism (Phase 9)**: `apps/api/src/modules/ratings/ratings.service.ts` recomputes from every rating a user has received on every new submission (never increments/decrements, so it stays correct if a rating is ever retroactively changed) — the actual math is a pure function, `packages/domain/src/rating/rating-aggregate.ts`. Submission is server-enforced to one rating per `(tripId, raterUserId)` pair, within a 24h window of `trips.completedAt` (`packages/domain/src/rating/rating-window.ts`), both as 409s.

### `riderProfiles` (new — Phase 9)
`id, userId (unique FK→users), ratingAvg, tripCount, punctualityScore, createdAt, updatedAt`. One-to-one with `users`, created lazily on a rider's first received rating or first completed trip. **The rider-reputation storage decision Phase 9 was required to make** (previously an open design question, flagged as unresolved technical debt in `docs/roadmap/README.md`): a dedicated table, mirroring `driverProfiles`' aggregate shape, chosen over extending `users` directly with nullable aggregate columns. Reasoning:
- **Symmetry**: `driver_rates_rider` ratings need a write/recompute target exactly like `rider_rates_driver` ratings do for `driverProfiles` — the same aggregation logic now applies to either table depending on which side of the rating the ratee is on.
- **Churn isolation**: these columns are rewritten on every new rating a rider receives; keeping that write churn off `users` (read on every authenticated request) avoids growing write-amplification on the one table almost every request touches.
- **Optionality**: not every user is ever rated as a rider — a one-to-one *optional* table models "no rider reputation yet" as "no row," the same pattern `driverProfiles` already uses for "not a driver," rather than nullable columns on every user row regardless of whether they've ever ridden.

### Trust tiers (new — Phase 9)
`packages/domain/src/rating/trust-tier.ts`'s `computeTrustTier({tripCount, ratingAvg, accountAgeDays})` is pure, no-I/O logic (mirroring the existing state-machine-module pattern) producing one of three VAYA-branded tiers — "Nouveau" (`tripCount` ≤ 4, regardless of rating/tenure), "Top VAYA" (`tripCount` ≥ 20 **and** `ratingAvg` ≥ 4.7 **and** account age ≥ 60 days, all three independently required), or "Confiance" otherwise. Not stored — computed on read by `GET /users/:id/trust-summary` (`ratings.service.ts`'s `getTrustSummary`) from whichever of `driverProfiles`/`riderProfiles` the user has, alongside the raw aggregate. Public-safe shape only: never exposes raw rating comments, in either direction.

### `notifications`
`id, userId, type (booking_requested|booking_accepted|booking_declined|trip_driver_approaching|trip_completed|recurring_pattern_detected|recurring_proactive_match|demand_signal_matched), payload (jsonb), readAt`. **The event taxonomy already anticipates recurring-ride and demand-signal notifications** — the schema was designed ahead of the features that would populate it. Columns unchanged since the original audit. **As of Phase 7 (`docs/roadmap/phase-07-notifications.md`), a real dispatch mechanism exists**: a row created for `booking_requested`/`booking_accepted`/`booking_declined` (the only 3 types wired up so far) enqueues a BullMQ job that pushes to the user's registered `device_tokens` via Expo's push API. The other 5 event types remain schema-only, populated by nothing yet — future phases (Recurring Rides, demand signals) wire those.

### `device_tokens` (new — Phase 7)
`id, userId (FK→users, cascade), token (globally unique), platform (ios|android), createdAt, updatedAt`. One row per (user, device) — a device's Expo push token. A re-registration (reinstall, refreshed token, or the same device logging into a different account) updates the existing row in place rather than accumulating duplicates, since `token` uniquely identifies one current installation. Written via `POST /users/me/push-token`; read by the notification-dispatch worker (`apps/api/src/modules/notifications`) to know where to push.

### `demand_signals`
`id, userId, originLabel/Lat/Lng, destinationLabel/Lat/Lng, desiredWindowStart/End, status (open|notified|expired)`. Backs the "notify me" fallback in `results.tsx` — created via `createDemandSignal`, read by `corridorFallback` in `matching.service.ts` to count unmet demand near a searched corridor. **Source of truth for unmatched passenger intent** — valuable signal for where to seed driver supply (see `docs/product/benchmark.md` §6 cold-start).

### `recurring_patterns`
`id, userId, role (rider|driver), routeId (nullable), originLabel/Lat/Lng, destinationLabel/Lat/Lng, daysOfWeekMask, timeWindowStart/End, timeWindowEnd, confidenceScore, status (detected|suggested|enabled|dismissed), lastMatchedAt`. **Phase 11** (`docs/roadmap/phase-11-recurring-rides.md`) built the first consuming logic for this table — the Karos/Klaxit-style repeat-route mechanism from the benchmark (`docs/product/benchmark.md` §7): a periodic detection job (`apps/api/src/modules/recurring`, dispatched via Phase 7's existing BullMQ queue as a second job type) clusters a user's ride/booking history by corridor (`packages/domain/src/recurring/detect-recurring-patterns.ts`, pure/unit-tested) and writes/refines `detected`/`suggested` rows; `GET /recurring-patterns` and `PATCH /recurring-patterns/:id` (enable/dismiss) let the user act on them. Columns are unchanged from the original schema — no new columns were needed (see `should-resuggest-after-dismissal.ts`'s doc comment for how the dismissed-pattern re-suggestion rule reuses the existing `confidenceScore` column instead of adding a trip-count column).

### `recurring_detection_configs` (new — Phase 11)
`id, scope (default 'global'), minTripCount, fullConfidenceTripCount, lookbackDays, corridorRadiusMeters, timeWindowMinutes, suggestedConfidenceThreshold, dismissalRequiredConfidenceDelta, active, createdAt, updatedAt`. Externalized, tunable detection thresholds — mirrors `pricing_configs`' exact shape/role (a single active row, mapped onto `@vaya/domain`'s pure `RecurringDetectionConfig`, with an in-package default fallback if no row exists). See `packages/domain/src/recurring/recurring-detection-config.types.ts` for what each column controls and `default-recurring-detection-config.ts` for the first-cut values and their derivation.

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
- **Trip status**: `scheduled → driver_approaching → pickup → active → arriving → completed`, with `no_show`/`cancelled` as alternate terminal states. Defined in `packages/domain/src/trip` (`canTransitionTripStatus`), consumed by the new `apps/api/src/modules/trips` module (Phase 9) — **the first real caller this state machine ever had**; before Phase 9, nothing in `apps/api` transitioned a trip's status at all. Phase 9 also added a direct `completed` edge from every non-terminal status (not gated behind first passing through each intermediate one), documented in `trip-status.ts` itself.
- **Recurring pattern status**: `detected → suggested → enabled`, or `dismissed` at any point. Defined in `packages/domain/src/recurring/recurring-pattern-status.ts` (`canTransitionRecurringPatternStatus`), consumed by `apps/api/src/modules/recurring/recurring.service.ts` (Phase 11) — the first real caller. Resurrecting a `dismissed` pattern (materially stronger evidence on a later detection scan) is deliberately a system-only transition, not reachable via the user-facing `PATCH /recurring-patterns/:id` endpoint — see `should-resuggest-after-dismissal.ts`.
- **Verification status**: `pending → approved|rejected`, on `driver_profiles`.

## Source-of-truth summary

| Concern | Authoritative table |
|---|---|
| Identity | `users` |
| Driver standing/trust score | `driver_profiles` |
| A published trip offer | `rides` |
| A passenger's request | `bookings` |
| Trip-day execution state | `trips` |
| Post-trip reputation | `ratings` (aggregated into `driver_profiles` and, new, `rider_profiles`) |
| Unmet demand | `demand_signals` |
| Commute pattern | `recurring_patterns` |
| Familiarity between two users | `relationship_signals` |
| Candidate stops on a route (new) | `route_stops` |
| Price bounds (new) | `pricing_configs` |
| A device's push token (new, Phase 7) | `device_tokens` |
| A booking's driver↔rider conversation (new, Phase 8) | `conversations` / `messages` |
| A rider's reputation aggregate (new, Phase 9) | `rider_profiles` |
| Recurring-pattern detection thresholds (new, Phase 11) | `recurring_detection_configs` |
