# Phase 7 — Notifications Foundation

**Horizon:** NOW/NEXT boundary · **Estimated complexity:** Medium

## Objective

Give the already-modeled `notifications` table (event types: `booking_requested`, `booking_accepted`, `booking_declined`, `trip_driver_approaching`, `trip_completed`, `recurring_pattern_detected`, `recurring_proactive_match`, `demand_signal_matched`) an actual delivery mechanism. Today rows can exist but nothing pushes anything to a device — this blocks drivers from knowing a booking request arrived, and blocks the "notify me" demand-signal feature from ever having teeth.

## Prerequisites

Phase 1 (booking flow correctness — no point notifying about a racy accept). Phase 2 (Toast, for in-app notification display).

## Exact scope

1. Add `expo-notifications` to `apps/mobile` (currently absent entirely per the audit). Implement device push-token registration on login/app-start.
2. New API: `POST /users/me/push-token` (register/update a device token), storing it on `users` or a new `device_tokens` table (`userId`, `token`, `platform`, `updatedAt`) — a new table is cleaner than overloading `users`.
3. Backend dispatch: when a `notifications` row is created for the events already in scope (`booking_requested`, `booking_accepted`, `booking_declined` at minimum for this phase — trip/recurring/demand events can follow in later passes), send a push notification via Expo's push API using the registered token(s).
4. Introduce a background job/queue (BullMQ + the already-provisioned Redis) for dispatch, rather than sending inline in the request/response cycle — a push-send failure must never fail the booking-accept API call itself.
5. Mobile: in-app notification display via Phase 2's Toast for foreground events; respect OS-level push permissions flow (request at a sensible moment, not on first app launch).
6. A minimal notifications list/inbox screen reading from `GET /notifications` (mark-as-read via `readAt`).

## User flows

Driver: publishes ride → passenger books → **driver gets a push notification** → opens app to the requests view (from Phase 4/wherever booking management lives). Passenger: requests a booking → **gets a push notification when accepted/declined**.

## Screens

New: a simple notifications inbox (list, unread indicator, tap-through to the relevant ride/booking). Existing screens gain a Toast for foreground in-app events (Phase 2 dependency).

## UX behavior

- Push permission requested contextually (e.g. right after a driver publishes their first ride, or a passenger makes their first booking) — not an OS permission dialog on cold start before the user has any reason to want it.
- Foreground: Toast. Background/killed: native OS push notification, tapping it deep-links into the relevant screen (requires the deep-linking config the audit found missing — add the minimum needed here, don't build a general deep-linking system beyond what these notification types need).

## Design-system work

Reuses Phase 2's Toast. A notification-list-item pattern (icon + text + timestamp) is a small composition of existing primitives (`Row`, `Text`, `Icon`, `Badge` for unread), not a new primitive class.

## Frontend

`apps/mobile/src/services/notifications/` (new — token registration, permission flow), `apps/mobile/app/notifications/index.tsx` (new inbox screen), `apps/mobile/app/_layout.tsx` (notification-tap deep-link handling), `apps/mobile/package.json` (add `expo-notifications`).

## Backend

New `device_tokens` table + migration, `apps/api/src/modules/users` (token registration endpoint), new `apps/api/src/modules/notifications` module (dispatch service + `GET /notifications` + mark-read endpoint), BullMQ job setup (`apps/api/src/lib/queue.ts` or similar, new — first use of a job queue in this codebase, keep it minimal: one queue, one worker process pattern, don't over-architect a multi-queue system for three event types).

## Database

New `device_tokens` table. No changes to the existing `notifications` table (already correctly shaped).

## API

`POST /users/me/push-token`, `GET /notifications`, `PATCH /notifications/:id/read`. Internal (not client-facing): the dispatch worker consumes from the queue, not an HTTP endpoint.

## Business rules

- A push-send failure must be logged and retried (queue-native retry) but must never surface as an error to the triggering action (e.g. accepting a booking succeeds even if the push send fails).
- A user with no registered device token simply doesn't get a push — the in-app `notifications` row still exists for the inbox, this isn't a hard dependency.

## Testing

- Unit test for the dispatch worker given a `notifications` row and a registered token, confirming it calls Expo's push API with the right payload (mock the actual push call).
- Integration test confirming `booking_accepted`/`booking_declined`/`booking_requested` events enqueue a dispatch job when the relevant booking-service methods run.
- Mobile test for token registration flow and Toast-on-foreground-event behavior.

## Analytics

- `push_permission_granted` / `push_permission_denied`.
- `notification_delivered` / `notification_tapped` (per event type — measures which notification types actually drive engagement, useful for prioritizing which of the remaining event types to wire up next).

## Definition of Done

- [ ] Device tokens register successfully on login.
- [ ] `booking_requested`/`booking_accepted`/`booking_declined` reliably produce a real push notification on a physical or simulator device with the app backgrounded.
- [ ] A push-send failure doesn't affect the triggering API call's success.
- [ ] Notifications inbox screen lists real notifications, supports mark-as-read.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Dependencies

Directly needed by Phase 9 (Ratings — prompting for a rating needs a delivery mechanism) and any future use of the already-modeled `recurring_pattern_detected`/`demand_signal_matched` event types (Phase 11, Recurring Rides).

## Risks

This is the first background job/queue in the codebase — resist the temptation to build a general-purpose job framework; scope it tightly to notification dispatch. Push notification setup (APNs certificates, FCM config) has real external-service setup steps outside pure code that should be budgeted for explicitly.
