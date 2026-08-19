# Phase 8 — Messaging

**Horizon:** NEXT · **Estimated complexity:** Medium–High

## Objective

Enable driver↔passenger communication scoped to a confirmed booking — currently entirely absent (`docs/product/audit.md` §1). This is not a general chat/social feature; it exists only to coordinate a specific trip (confirm pickup details, handle a last-minute delay) and closes when the trip concludes.

## Prerequisites

Phase 7 (Notifications — new messages need a delivery mechanism to be useful).

## Exact scope

1. New `conversations` and `messages` tables (see `docs/domain/model.md` — schema to be finalized in this phase, not before, per that document's explicit note not to build ahead of it).
2. A `conversation` is created automatically when a `booking` reaches `accepted` status (one conversation per booking, not per ride — a driver with 3 accepted passengers has 3 separate conversations, avoiding an accidental group-chat model that raises different moderation/privacy questions).
3. Delivery: polling-based (`GET /conversations/:id/messages?since=`) is sufficient for launch — do not introduce WebSockets/real-time infrastructure speculatively; revisit only if polling latency proves to be a real user complaint.
4. New push notification event type for incoming messages (extends Phase 7's dispatch, doesn't require rearchitecting it).
5. Mobile: a simple conversation screen (message list + input), reachable from the booking/trip screens once a booking is accepted.
6. Conversation becomes read-only after the trip reaches a terminal state (`completed`/`cancelled`/`no_show`) — messaging exists to coordinate a live trip, not to become a permanent chat log.

## User flows

Both driver and passenger: from a confirmed booking/trip screen, tap "Message" → conversation view → send/receive text messages → push notification on new message when the other party isn't in-app.

## Screens

New: `apps/mobile/app/conversations/[bookingId].tsx` (or similar route). Entry points added to existing booking/trip screens (`bookings/pending.tsx` through `live.tsx`).

## UX behavior

- Standard chat UI conventions (own messages right-aligned, timestamps, read receipts are a nice-to-have, not required for v1).
- Empty state: "Say hello — coordinate your pickup" prompt on a fresh conversation.
- Read-only banner once the trip is completed/cancelled, explaining why sending is disabled.

## Design-system work

A message-bubble primitive if the existing `Card`/`Text` composition doesn't cover it cleanly — likely a small new primitive (`MessageBubble`) given how central and reused this pattern will be within the screen.

## Frontend

New `apps/mobile/app/conversations/*`, new `apps/mobile/src/state` slice or RTK Query endpoints for polling.

## Backend

New `apps/api/src/modules/conversations` module (or extend `bookings`), new tables + migration, extends Phase 7's notification dispatch for the new event type.

## Database

`conversations (id, booking_id FK unique, status, created_at, updated_at)`, `messages (id, conversation_id FK, sender_user_id FK, body, created_at)`. Index on `(conversation_id, created_at)` for the polling query.

## API

`GET /conversations/:bookingId`, `GET /conversations/:id/messages?since=`, `POST /conversations/:id/messages`.

## Business rules

- Only the two parties on the booking (driver, rider) may read/write to a conversation — enforced server-side on every request, not just at conversation-creation time.
- No message send allowed once the conversation is closed (trip terminal state) — return a clear error, not a silent no-op.
- Basic content safety: length limits, no attachments in v1 (text only) — keep the surface area small for a first version of a feature that touches two strangers communicating.

## Testing

- Unit tests for conversation authorization (only the two booking parties can access).
- Integration test for the full lifecycle: booking accepted → conversation created → messages sent → trip completed → conversation becomes read-only.
- Mobile test for the conversation screen's polling/send behavior.

## Analytics

- `conversation_started`, `message_sent` (per role), `conversation_message_count` (distribution — useful for deciding later whether real-time delivery is actually needed).

## Definition of Done

- [ ] Conversation auto-created on booking acceptance.
- [ ] Both parties can send/receive messages; a third party cannot access the conversation.
- [ ] Conversation becomes read-only on trip completion/cancellation.
- [ ] Push notification fires for a new message when the recipient isn't active in-app.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Dependencies

None later strictly depends on this, but it materially improves the trip-day experience described in both journey docs.

## Risks

Content moderation/abuse (harassment via messaging) is a real risk once this ships to real users — this phase deliberately keeps the surface minimal (text-only, two-party, time-bounded) to limit exposure, but a reporting/blocking mechanism should be considered a near-term follow-up, not deferred indefinitely. Flag as an open decision if not scoped into this phase directly.
