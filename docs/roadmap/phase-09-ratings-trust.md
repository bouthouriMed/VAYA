# Phase 9 — Ratings, Reviews & Trust Signals

**Horizon:** NEXT · **Estimated complexity:** Medium

## Objective

Close the loop on the `ratings` table (already correctly shaped, per `docs/domain/model.md`) with an actual submission flow and, critically, surface trust signals to the *other* party before they commit — per the benchmark's central lesson (`docs/product/benchmark.md` §2, §5) and `docs/ux/principles.md` #7 ("trust is visible before commitment, not after"). VAYA already has the harder half of this (identity verification via driver onboarding) — this phase is about the reputation half.

## Prerequisites

Phase 7 (Notifications — rating prompts need delivery), Phase 1 (`trips` data must be real, not mock, for a rating prompt to reference the correct trip).

## Exact scope

1. Post-trip rating prompt: triggered when a `trips.status` reaches `completed`, within a 24-hour submission window (mirroring the benchmark). Both directions: rider rates driver, driver rates rider (`ratings.role` already models both).
2. Rating aggregation: a job/trigger that recomputes `driver_profiles.ratingAvg`/`punctualityScore` when a new rating lands (confirm/build whichever mechanism doesn't already exist — the backend audit didn't locate one).
3. Rider-side reputation: currently only `driver_profiles` carries aggregate scores. Decide and implement whether riders need an equivalent aggregate (a `rider_profiles` extension or reuse of `users`) — riders being rated (`driver_rates_rider`) already happens per the schema, so their aggregate needs a home. This is a real design decision this phase must resolve, not inherited from an existing pattern.
4. Trust-tier surfacing: a simple tenure+quality tier (e.g. "New," "Trusted," "Top-rated" — VAYA's own naming, not a copy of BlaBlaCar's Expert/Ambassador labels) computed from `tripCount`/`ratingAvg`/account age, shown on driver profile and in search results (`search/results.tsx`, `search/trust.tsx`).
5. Mobile: a rating-submission screen/sheet (star rating + optional comment + punctuality flag), reachable from the post-trip notification and from `bookings/settlement.tsx`.

## User flows

Trip completes → both parties get a push notification (Phase 7) prompting a rating → rating submitted (or window expires, un-submitted) → aggregate score updates → visible to future counterparties before their next booking decision.

## Screens

New: a rating-submission bottom sheet/screen. Existing: `search/trust.tsx` and results cards gain a visible trust-tier badge; driver onboarding's completed profile view (if one exists) shows the same.

## UX behavior

- Rating prompt is a bottom sheet (Phase 2), not a full-screen interrupt — low friction, dismissible, but re-surfaced once (e.g. next app open) if not submitted within the window.
- Star rating with an optional comment and a specific punctuality flag (`punctualityFlag` already exists in schema) — matches the existing column shape exactly, don't invent new fields.
- Trust-tier badge uses existing `Badge`/`Meter` primitives (already built, already used for reliability display per the design-system audit) — this is largely a data-wiring task, not a new visual pattern.

## Design-system work

Minimal — reuses `Badge`, `Meter`, `ReviewCard` (already exists per the design-system audit, currently likely unused pending this exact feature), `BottomSheet` (Phase 2).

## Frontend

New rating-submission screen/sheet, `search/trust.tsx` and results cards updated to show trust tier, `bookings/settlement.tsx` wired to real rating-eligibility state.

## Backend

`apps/api/src/modules/ratings` (submission endpoint + aggregation logic — extend or build), `packages/domain/src/rating` (aggregation/tier-computation as pure logic, following the existing state-machine-module pattern), Phase 7's notification dispatch (new event type for rating prompts, or reuse `trip_completed`).

## Database

No new tables — `ratings` already fits. Possible addition: a `rider_profiles` table (mirroring `driver_profiles`' aggregate-score shape) if the rider-reputation decision above lands that way; otherwise extend `users` with the minimum needed aggregate columns. **Decide before implementing** — don't build both.

## API

`POST /trips/:id/ratings`, `GET /users/:id/trust-summary` (tier + aggregate, public-safe shape — never expose raw comments to just anyone, only aggregate scores plus the submitter's own comments to themselves).

## Business rules

- A rating can only be submitted once per `(tripId, raterUserId)` pair, within the 24h window — enforced server-side.
- Aggregate recomputation must be consistent (a rating submitted, then later disputed/removed by a moderation action — out of scope for this phase, but the aggregation logic should be written as "recompute from all ratings," not "increment/decrement," so it's correct if a rating is ever retroactively changed).
- Comments are private between the trip parties and platform moderation, not publicly displayed verbatim in this phase (public display of review text, if wanted later, is a distinct decision — start conservative).

## Testing

- Unit tests for tier computation given various `tripCount`/`ratingAvg`/account-age combinations.
- Unit test for the one-rating-per-trip-per-rater constraint.
- Integration test for the full lifecycle: trip completes → prompt → submit → aggregate updates → visible on the other party's next search result.

## Analytics

- `rating_prompted`, `rating_submitted`, `rating_window_expired` (submission rate is a real product health metric).
- `trust_tier_shown` / correlation with booking conversion (useful for validating the tier actually influences booking decisions, the core premise from the benchmark).

## Definition of Done

- [ ] Rating submission works both directions (rider→driver, driver→rider) within the 24h window.
- [ ] Aggregate scores update correctly and are visible pre-booking.
- [ ] Trust-tier badge appears in search results and the trust/booking screen.
- [ ] Rider-reputation storage decision made and implemented consistently (no half-built dual mechanism).
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Dependencies

Improves the effectiveness of every earlier phase's booking decision (passengers choosing among matched rides, drivers deciding whether to accept a request) but doesn't block them.

## Risks

Rider-reputation data modeling is the one genuinely undecided piece here — resolve it explicitly (with the user, if needed, via a clarifying question at implementation time) rather than guessing and building something that has to be migrated again later.
