# Phase 10 — Cancellation & No-Show Policy

**Horizon:** NEXT · **Estimated complexity:** Medium

## Objective

Build the cancellation flow that currently doesn't exist anywhere in the app (`docs/product/audit.md` §1), with an explicit, time-based policy rather than an unconstrained free cancel. `bookings.status` already models the terminal states needed (`cancelled_by_rider`, `cancelled_by_driver`, `no_show`) — this phase builds the UI and policy logic around states that already exist in the schema.

## Prerequisites

Phase 1 (booking integrity), Phase 7 (Notifications — cancellation needs to notify the other party).

## Exact scope

1. Define VAYA's own cancellation policy tiers — informed by, but not copied numerically from, the benchmark (`docs/product/benchmark.md` §2: BlaBlaCar's >24h/‹24h/‹30min tiers). This is a business decision to finalize explicitly in this phase (see Business rules), not an engineering default.
2. Cancellation UI: accessible from any active booking/trip screen, with the applicable policy tier shown before confirming (e.g. "cancelling now: full refund" vs. "cancelling now: reduced/no refund" if/when payments exist — see note below).
3. No-show reporting: distinct from cancellation — a driver marks a passenger "unreachable"/no-show near departure time (mirrors the benchmark's driver flow), or a passenger reports a driver never arrived. Both feed `bookings.status = 'no_show'` and, per the benchmark, can trigger an automatic low rating for the no-show party (ties into Phase 9).
4. Backend enforcement of the policy tiers based on `departureAt` vs. cancellation timestamp.

## User flows

Either party, from an active booking: tap "Cancel" → see the applicable policy consequence → confirm → other party notified (Phase 7) → booking/trip status updated. Near departure time with no contact: driver marks passenger unreachable, or passenger reports driver no-show, from the trip-day screen.

## Screens

New: a cancellation confirmation flow (likely a Modal/BottomSheet from Phase 2, not a full new route — this fits `docs/ux/principles.md`'s "prefer a sheet over a new screen" guidance directly). No-show reporting: a small affordance on the trip-day screen (`bookings/live.tsx` or equivalent).

## UX behavior

- Policy consequence shown *before* the user commits to cancelling, not after — no surprise outcomes.
- No-show reporting requires the reporting party to have made a reasonable contact attempt first where feasible (e.g. surfaced as guidance text, not a hard technical gate in v1) — mirrors the benchmark's "can't contact" framing rather than a bare accusation flow.

## Design-system work

Reuses Phase 2's Modal/BottomSheet. No new primitives expected.

## Frontend

New cancellation flow component (likely shared across `bookings/*.tsx` screens rather than duplicated per screen), no-show reporting affordance on the trip-day screen.

## Backend

`apps/api/src/modules/bookings/bookings.service.ts` (cancellation endpoint with policy-tier logic), `packages/domain/src/booking` (policy-tier computation as pure logic, following the existing pattern), Phase 7's notification dispatch (new event types for cancellation/no-show).

## Database

No new tables — `bookings.status` already has the needed terminal states. If a monetary refund/compensation mechanism is introduced later (out of scope while there's no payment system — see note below), a `cancellation_id`/reason/tier audit trail may be worth adding then, not speculatively now.

## API

`POST /bookings/:id/cancel` (with policy tier computed and returned in the response so the client can show the consequence before final confirm — consider a `GET` "preview" call or compute it client-visible before the destructive action), `POST /bookings/:id/report-no-show`.

## Business rules

- Cancellation policy tiers (exact time windows and consequences) must be explicitly decided before implementation — do not default to copying BlaBlaCar's specific percentages/windows without a deliberate choice, since **VAYA has no payment system yet**, so "refund" consequences don't apply the same way. In the absence of payments, the meaningful consequence today is reputation-based (a late cancellation affects `reliabilityScore`/rating visibility), not monetary. Define the policy in these terms for this phase; revisit once/if payments exist.
- No-show marking should require passage of a minimum time past `departureAt` (e.g. can't mark someone no-show before the scheduled time) — a business rule to prevent premature/abusive marking.

## Testing

- Unit tests for policy-tier computation given various cancellation-timing scenarios.
- Integration test for the full cancel flow: booking cancelled → status updated → other party notified → reliability score impact applied (if in scope) → seat released back if applicable (`rides.seatsAvailable` increments correctly, and must go through the same atomic-update discipline as Phase 1's fix — no new race introduced here).
- Mobile test for the cancellation confirmation flow showing the correct policy consequence.

## Analytics

- `booking_cancelled` (by role, by time-to-departure bucket), `no_show_reported` (by role) — real product-health signals for marketplace trust.

## Definition of Done

- [ ] Cancellation policy tiers explicitly defined and documented (in this file or a linked decision doc) before implementation begins.
- [ ] Cancellation flow accessible from all active booking states, shows consequence before confirming.
- [ ] Seat release on cancellation is atomic (reuses Phase 1's pattern, doesn't reintroduce a race).
- [ ] No-show reporting works both directions and feeds the rating system appropriately.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Dependencies

None later strictly depends on this, but it's a core trust-and-safety gap that should not be deferred indefinitely once real users are transacting.

## Risks

The absence of a payment system changes what "cancellation policy" even means today (no money to refund) — resist importing BlaBlaCar's monetary policy tiers wholesale; design VAYA's own reputation-based consequence model for now, and revisit if/when payments are introduced.
