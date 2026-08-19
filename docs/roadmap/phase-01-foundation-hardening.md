# Phase 1 — Foundation Hardening

**Horizon:** NOW · **Estimated complexity:** Low–Medium

## Objective

Fix the concrete, already-identified correctness and integrity bugs before any new feature work lands on top of them. This phase makes no new product surface — it makes the existing product actually trustworthy. Every item here is a confirmed finding from `docs/product/audit.md`, not a hypothetical.

## Prerequisites

None — this is the recommended first phase, operating entirely on existing code.

## Exact scope

1. **Fix the booking-acceptance race condition.** `apps/api/src/modules/bookings/bookings.service.ts` `acceptBooking` (~lines 97-113) currently checks `rides.seatsAvailable` then updates it in a separate statement. Wrap the check-and-decrement in a single atomic operation: `UPDATE rides SET seats_available = seats_available - :requested WHERE id = :rideId AND seats_available >= :requested RETURNING *`, and treat a zero-row result as a `ConflictError` (seats no longer available), not a silent success.
2. **Add missing database indexes.** No explicit indexes exist beyond PK/unique across either migration. Add:
   - `rides`: composite index on `(status, departure_at)` — the exact filter used in `matching.service.ts`'s hot path.
   - `bookings`: index on `ride_id`, index on `rider_id`.
   - `trips`: index on `ride_id` (already unique on `booking_id`).
   - `ratings`: index on `trip_id`, index on `ratee_user_id` (needed once rating aggregation is built in Phase 9).
   - `demand_signals`: index on `status`.
   Generate via `pnpm db:generate` after adding index definitions to the relevant `*.schema.ts` files — do not hand-write migration SQL.
3. **Register `@fastify/rate-limit`** in `apps/api/src/app.ts` alongside the existing `cors`/`helmet`/`jwt` registrations. Start conservative (e.g. 100 req/min per IP globally, tighter on `/auth/otp` specifically to prevent OTP-spam abuse) — tune later, don't leave it unregistered.
4. **Add a root `ErrorBoundary`** in `apps/mobile/app/_layout.tsx` wrapping the existing `Stack`, rendering a design-system-composed fallback (reuse `Card`/`Button`/`Text`, not raw RN) instead of crashing to a blank frame.
5. **Wire the post-booking screens to real data.** `apps/mobile/app/bookings/pending.tsx` and `pickup.tsx` currently render hardcoded values (pickup window, confidence label, `PICKUP_LABEL` from `src/mocks/seed-data.ts`) after a real `createBooking` call. Replace with data actually returned from the booking/ride/trip API responses. Audit `confirmed.tsx`, `live.tsx`, `settlement.tsx` for the same pattern (flagged as likely in `docs/ux/passenger-journey.md` §6/§8/§9 but not fully confirmed) and fix any found. Where a real field genuinely doesn't exist yet server-side (e.g. a computed pickup-window estimate), show an honest "estimating…" state rather than a fabricated number — do not invent new backend logic in this phase beyond what's needed to pass through real `trips`/`bookings` fields.
6. **Show a branded loading state** during `AuthHydrator`'s token-loading gap in `_layout.tsx` instead of `null`.

## User flows

No new flows. Existing flows (booking, publish, auth) behave identically from the user's perspective except: (a) a booking accept during a seat race now correctly fails with a clear "seat no longer available" message instead of silently overselling, (b) post-booking screens show real trip state instead of fabricated placeholders.

## Screens

`bookings/pending.tsx`, `pickup.tsx`, `confirmed.tsx`, `live.tsx`, `settlement.tsx`, `app/_layout.tsx`. No new screens.

## UX behavior

- Seat-race failure: a clear, non-blaming error state ("This seat was just taken — try another ride") with a path back to search, not a raw error toast.
- Loading gap during auth hydration: branded splash matching `expo-splash-screen`'s existing asset, not a blank white/black frame.
- Post-booking screens: any field without real backing data shows a skeleton or "estimating…" label, never a plausible-looking fake value.

## Design-system work

None new required — reuse existing `Card`, `Button`, `Text`, `ActivityIndicator` patterns. (The dedicated Skeleton/EmptyState/ErrorBoundary-fallback primitives come in Phase 2; this phase can use existing primitives as a stopgap.)

## Frontend

`apps/mobile/app/_layout.tsx`, `apps/mobile/app/bookings/*.tsx`, remove/reduce reliance on `apps/mobile/src/mocks/seed-data.ts` for these screens specifically (don't delete the mock file — other screens/tests may still use it legitimately for fixtures).

## Backend

`apps/api/src/modules/bookings/bookings.service.ts`, `apps/api/src/app.ts` (rate limit registration), `apps/api/src/db/schema/*.ts` (index additions), new Drizzle migration.

## Database

New migration adding the indexes listed above. No new tables, no column changes.

## API

No new endpoints. `POST /bookings/:id/accept` (or equivalent) changes its failure-mode contract: previously could silently succeed under a race, now correctly returns a 409 Conflict when seats run out concurrently — this is a behavior fix, document it in the OpenAPI description.

## Business rules

- A booking acceptance must never allow `seats_available` to go negative under concurrent requests — enforced atomically at the database level, not just application-level.
- No UI may display a value implying real trip/booking state unless that value came from an actual API response for that specific trip/booking.

## Testing

- Unit test for `acceptBooking` covering the concurrent-accept race (two simulated concurrent calls against the same ride with exactly enough seats for one) — this is the single most important new test in this phase, since the bug is a real concurrency bug that a naive sequential test won't catch; use a test that actually issues both database calls concurrently (e.g. `Promise.all`) rather than mocking the race away.
- Integration test confirming rate limiting returns 429 after the configured threshold on a test endpoint.
- Mobile test confirming `pending.tsx`/`pickup.tsx` render fields from injected API response data, not from `seed-data.ts` imports (a regression guard against this exact bug recurring).

## Analytics

Not applicable — this phase is corrective, no new user-facing behavior to instrument beyond the seat-race error path (`booking_accept_conflict` event, useful for monitoring how often this actually occurs in production).

## Definition of Done

- [ ] `acceptBooking` uses an atomic conditional update; concurrency test passes and fails on the old implementation if reverted.
- [ ] All listed indexes exist via a generated migration, confirmed with `EXPLAIN` showing index usage on the matching query.
- [ ] `@fastify/rate-limit` registered and returns 429 correctly under a test.
- [ ] Root `ErrorBoundary` renders a design-system fallback on a forced test error.
- [ ] `pending.tsx`, `pickup.tsx`, and any other confirmed-affected screens render only real API-sourced data; `seed-data.ts` is no longer imported by these screens.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass.

## Dependencies

Every later phase benefits from this one (correct seat accounting, real trip data available downstream, indexes in place before matching query volume grows). No later phase is blocked from starting without it, but Phase 6 (Pricing) and Phase 4/5 (Ride Engine) should land after this to avoid compounding the booking-integrity bug with new booking paths.

## Risks

Low — these are narrow, well-understood fixes. The main risk is scope creep (e.g. "while we're in `bookings.service.ts`, let's also add X") — resist it, this phase is deliberately narrow.
