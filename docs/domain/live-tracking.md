# Live Ride Tracking

## Why this exists

Before this change, `bookings/live.tsx` was an explicit presentational mock: a `setTimeout(4000)` auto-advanced the passenger to the settlement screen regardless of anything real happening, its own code comment admitted "there's no real-time position feed," and `trips` had no location columns at all. Drivers had no way to signal "I've started the journey," and passengers had no way to see where their driver actually was. This document defines the real system that replaces the mock.

**Core principle, restated from the task brief:** the passenger must always be able to tell, at a glance, whether what they're looking at is genuinely current — a stale or missing GPS fix must never be presented as if it were live.

## What already exists and is reused, not rebuilt

- **The trip state machine** (`packages/domain/src/trip/trip-status.ts`) — `scheduled → driver_approaching → pickup → active → arriving → completed/no_show/cancelled` already existed but nothing outside `POST /trips/:id/complete` (Phase 9) ever drove it through the intermediate states. Live tracking is the first real consumer of the full pipeline.
- **`RoutingProvider`** (`lib/routing-providers/`, Google Routes / OSRM) — `getRoute(origin, destination)` is reused unmodified for the live ETA/distance-remaining recompute (`current driver position → destination`), and `rides.routePolyline` (already computed at ride-creation time) is reused unmodified as the road-accurate route geometry the passenger's map draws — never a straight line.
- **Redis** (`lib/queue.ts`'s precedent of "reuse the existing Redis, a second logical client, not a second server") — the realtime pub/sub bridge is a second `ioredis` client against the same `REDIS_URL`, not new infrastructure.
- **`notifyBestEffort`** (Phase 7/8's dispatch mechanism) — tracking-related notifications reuse the exact same BullMQ → Expo-push pipeline; no second dispatch mechanism.
- **`AppError` hierarchy** / the existing `assertIsParty` ownership-check pattern from `trips.service.ts` — extended, not replaced.

## Data model — deliberately minimal retention

CLAUDE.md's brief is explicit: *"Minimize location retention. Do not store historical GPS unnecessarily."* Rather than a `trip_locations` history table, `trips` gained columns for only the **latest** fix, overwritten in place on every update:

```
trips.started_at            -- when POST /trips/:id/start was called
trips.current_lat/lng       -- latest reported driver position
trips.current_heading_deg
trips.current_speed_mps
trips.current_accuracy_m
trips.location_updated_at   -- freshness anchor for trackingStatus derivation
```

No row is ever inserted per GPS ping — only an `UPDATE`. This is a genuine trade-off, stated plainly: there is no server-side breadcrumb trail to replay a trip's exact path after the fact. That's the intended behavior per the privacy brief, not an oversight.

## Two orthogonal state machines, not one

A trip can be `active` (ride-progress state) while its GPS feed is `stale` or `unavailable` (feed-health state). Conflating them was the exact failure mode to avoid — a UI must never show a moving marker just because `trips.status` still says `active`.

- **`TripStatus`** (existing, `packages/domain/src/trip/trip-status.ts`) — where the journey is.
- **`TrackingStatus`** (new, `packages/domain/src/trip/tracking-status.ts`) — `not_started | starting | live | stale | unavailable | completed`, a pure function of `(tripStatus, locationUpdatedAt, now)`:
  - Terminal `tripStatus` (`completed`/`no_show`/`cancelled`) → always `completed`, regardless of location freshness.
  - `scheduled` → `not_started`.
  - A trackable status (`driver_approaching`/`pickup`/`active`/`arriving`) with no fix yet → `starting`.
  - Fix age ≤ `TRACKING_LIVE_AFTER_MS` (25s — tuned to tolerate one or two missed 6-10s pings) → `live`.
  - Fix age ≤ `TRACKING_STALE_AFTER_MS` (90s) → `stale`.
  - Older, or an explicit reported issue → `unavailable`.

This is computed fresh on every read (REST `GET /trips/:id/tracking`, every WebSocket push, and every location-update response) — never stored as a stale enum that could itself go stale.

## Lifecycle and the driver's three real actions

The driver only ever taps three things; everything else is inferred from GPS:

1. **"Démarrer le trajet"** → `POST /trips/:id/start` (`scheduled → driver_approaching`, sets `startedAt`, dispatches the pre-modeled-but-never-used `trip_driver_approaching` notification to the rider — Phase 7 added this event type to the schema in 2026, nothing ever populated it until now).
2. **"Passager à bord"** → `POST /trips/:id/passenger-aboard` (`→ active`, passing through `pickup` first if the proximity auto-transition hasn't already fired — boarding genuinely can't be GPS-inferred; a driver parked near the pickup point isn't necessarily a driver with the rider in the car).
3. **"Terminer le trajet"** → the existing `POST /trips/:id/complete` (Phase 9, unchanged).

Two transitions are inferred automatically from the driver's own GPS, via a pure function (`packages/domain/src/trip/tracking-transitions.ts`'s `computeAutoTripStatusTransition`), evaluated on every location update:

- `driver_approaching → pickup` once within `PICKUP_ARRIVAL_RADIUS_M` (150m) of the booking's pickup point.
- `active → arriving` once within `DESTINATION_APPROACH_RADIUS_M` (500m) of the destination (`bookings.dropoffLat/Lng` when set — Phase 13's pass-through dropoff — else the ride's own `destinationLat/Lng`), dispatching `trip_arriving` to the rider.

## Realtime transport

**WebSocket, `GET /ws/trips/:id?token=<jwt>`, with REST polling as an explicit, fully-functional fallback** — not the only path. Chosen over Socket.IO for being the lighter dependency (`@fastify/websocket`, native `ws` underneath, no separate wire protocol) given this codebase already runs a plain Fastify HTTP API; Socket.IO's extra abstraction (rooms, ack callbacks, its own reconnection protocol) buys nothing a WebSocket + Redis pub/sub + REST fallback doesn't already cover simply.

- **Auth**: a WebSocket handshake from React Native can't easily carry a custom `Authorization` header, so the JWT travels as a `?token=` query param, verified manually against the same secret every other route uses (`fastify.jwt.verify`) — then the same `assertIsParty` ownership check every REST tracking endpoint uses. An unauthorized/non-party connection is closed with code `4401` before ever joining the room.
- **Fan-out** (`lib/realtime.ts`): one in-process `Map<tripId, Set<WebSocket>>` "room" per trip. Every publish also goes through a Redis pub/sub channel (`trip-location:${tripId}`) — deliberately the *only* delivery path, even for the instance that published: every instance (including a lone single-instance deployment) is simply subscribed to its own channel, so the code is correct unmodified whether the API runs as one process or many, with zero special-casing. Falls back to direct in-process delivery only when `REDIS_URL` is unset, mirroring `lib/queue.ts`'s existing optional-Redis precedent.
- **Payload on connect**: an immediate `{type:'snapshot', ...}` with the full current tracking state (so a client never has to wait for the next driver ping to render something).
- **On every driver ping**: `{type:'location', tripStatus, trackingStatus, currentLat, currentLng, currentHeadingDeg, currentSpeedMps, locationUpdatedAt, etaSec?, distanceRemainingM?}`.
- **On a lifecycle transition** (manual or auto): `{type:'status', tripStatus}`.
- **On a reported tracking issue**: `{type:'tracking_issue'}`.

## Throttling and cost control

- **GPS reporting frequency** is a client-side policy (the mobile app), not server-enforced beyond a defensive rate-limit ceiling (`POST /trips/:id/location` capped at 20 req/10s per the route's `config.rateLimit` — a backstop against a misbehaving client, not the actual throttling policy). The mobile brief asks for roughly a 6-10s cadence, ideally also gated on real movement, not just a bare timer.
- **ETA/distance-remaining recompute** calls the real (potentially paid, Google Routes) `RoutingProvider` — far too expensive to do on every single ping. Throttled server-side to at most once per `ETA_RECOMPUTE_INTERVAL_MS` (20s) per trip via an in-process `Map<tripId, lastComputedAtMs>` in `trips.service.ts`. Deliberately in-process rather than Redis-backed: a multi-instance deployment might duplicate a handful of calls within one 20s window across instances, which is an acceptable cost for not adding a shared-state dependency to this hot path.

## Authorization and privacy

- Every tracking endpoint (REST and WebSocket) re-derives "is this user the trip's rider or driver" from the database on every request — never trusts a cached role client-side, matching this codebase's existing `assertIsParty` convention throughout `trips.service.ts`.
- A passenger can never reach another ride's tracking state or WebSocket room — there is no endpoint that lists or searches trips by anything other than a specific `tripId` the caller already proves party-ship to.
- No location history is retained (see Data model above) — nothing beyond the current fix exists to leak even in principle.

## Known limitations, stated plainly

- **No proactive "tracking has gone silent" push notification.** `trip_tracking_unavailable` exists and is dispatched, but only when the *driver's own app* explicitly detects and reports a real problem (`POST /trips/:id/tracking-issue`) — there is no server-side poller that notices a trip has been silent for N minutes and pushes about it on its own. Building that would need a scheduled/delayed job this phase's scope didn't extend to (the existing BullMQ queue could host it as a second job type later, following the Phase 11 precedent, if this turns out to matter in practice).
- **No cross-instance load testing.** The Redis pub/sub fan-out is architecturally correct for a multi-instance deployment (verified by code review and the fact that a single instance already exercises the exact same subscribe-to-own-channel path) but was only actually verified against a single API process in this environment.
- **Verified against real infrastructure, not simulated**: the full driver-start → WebSocket-snapshot → driver-location-ping → real-OSRM/Google-ETA → WebSocket-push → proximity-auto-transition → unauthorized-rejection path was exercised end-to-end against a real docker-composed Postgres, Redis, and OSRM instance during this implementation (not just unit-tested in isolation) — see `apps/api/src/modules/trips/__tests__/trips-tracking.integration.test.ts`.
