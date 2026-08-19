# Phase 11 — Recurring Rides

**Horizon:** NEXT · **Estimated complexity:** Medium

## Objective

Build the UI and matching logic for the `recurring_patterns` table, which already exists in the schema with a `detected → suggested → enabled → dismissed` lifecycle and a `confidenceScore` column, but has zero consuming logic today (`docs/domain/model.md`). This is VAYA's version of the Karos/Klaxit commute-matching pattern flagged in the benchmark as more relevant to intra-Tunisia trips than BlaBlaCar's original one-off long-distance model (`docs/product/benchmark.md` §7).

## Prerequisites

Phase 7 (Notifications — pattern detection surfaces via `recurring_pattern_detected`/`recurring_proactive_match`, both already-modeled event types), Phase 4/5 (Ride Engine — recurring rides benefit from stop selection, though not strictly blocking).

## Exact scope

1. A background job (extends Phase 7's queue) that periodically scans a user's ride/booking history for repeat origin-destination-time patterns (same corridor, similar time window, multiple occurrences) and writes a `detected`-status `recurring_patterns` row when found.
2. Mobile: surface a `detected`/`suggested` pattern as a proactive prompt ("You've taken this route 3 times this month — set it as a regular ride?") — this is the "suggested" → user acts → "enabled" transition.
3. Once `enabled`: for a **driver** pattern, the app auto-drafts (not auto-publishes) a ride for the matching day/time, requiring a single confirm tap rather than the full creation flow each time. For a **rider** pattern, the matching system proactively checks for matching published rides and can notify (`recurring_proactive_match` event) without the user re-searching.
4. Pattern management screen: view/dismiss/disable enabled patterns.

## User flows

Rider or driver who's taken a similar trip repeatedly gets a proactive prompt to formalize it as a recurring pattern → enables it → subsequently gets either auto-drafted ride confirmations (driver) or proactive match notifications (rider) instead of repeating the full search/publish flow each time.

## Screens

New: pattern-detection prompt (bottom sheet, per `docs/ux/principles.md`'s progressive-disclosure principle — not a new top-level screen for the prompt itself), a recurring-patterns management list screen, a lightweight "confirm today's auto-drafted ride" flow for drivers.

## UX behavior

- Detection is passive (background job), never requires the user to manually configure a pattern from scratch — the whole point is reducing repeated manual effort, so the entry point must be a proactive suggestion based on real behavior, not a form.
- Auto-draft for drivers requires explicit confirmation before publishing — never auto-publish a ride without the driver's same-day confirmation (departure time, seat availability, etc. can change day to day).
- Dismissing a suggestion should reduce (not eliminate) future re-prompting for that exact pattern — avoid nagging.

## Design-system work

Reuses BottomSheet, EmptyState (management screen with zero enabled patterns), existing list/card patterns.

## Frontend

New `apps/mobile/app/recurring/*` screens, detection-prompt component, driver auto-draft confirmation flow (likely reuses most of `driver/publish.tsx`'s later steps, pre-filled).

## Backend

New detection job (`apps/api/src/modules/rides` or a new `recurring` module — pattern-detection logic as pure/testable functions in `packages/domain/src/recurring`, following the existing module pattern), extends `matching.service.ts` for the proactive rider-match check, extends Phase 7's notification dispatch for the two already-modeled event types.

## Database

No new tables — `recurring_patterns` already fits. The detection job needs efficient querying of ride/booking history by user+corridor — verify indexing needs once query patterns are known; don't index speculatively.

## API

`GET /recurring-patterns` (mine), `PATCH /recurring-patterns/:id` (enable/dismiss), driver auto-draft confirmation endpoint (likely reuses the ride-creation endpoint with pre-filled values rather than a bespoke endpoint).

## Business rules

- Detection threshold (how many repeat trips, how similar the time window, what `confidenceScore` warrants a `suggested` prompt) is a tunable parameter, not hardcoded — mirrors the `pricing_configs`-style externalized-tunable pattern established in Phase 6.
- A dismissed pattern (`status = 'dismissed'`) should not be re-suggested identically — either suppress permanently or require materially stronger evidence (higher trip count) before re-prompting.

## Testing

- Unit tests for the detection algorithm given synthetic ride/booking history fixtures (clear repeat pattern, no pattern, borderline confidence).
- Integration test for the enable → auto-draft → confirm → publish flow (driver side) and enable → proactive match → notification flow (rider side).

## Analytics

- `recurring_pattern_detected`, `recurring_pattern_enabled`, `recurring_pattern_dismissed`, `recurring_auto_draft_confirmed` (conversion rate from suggestion to active usage is the key health metric for this feature).

## Definition of Done

- [ ] Detection job correctly identifies repeat patterns from real ride/booking history in a test dataset.
- [ ] Proactive prompt surfaces correctly and both enable/dismiss paths work.
- [ ] Driver auto-draft requires explicit same-day confirmation before publishing.
- [ ] Rider proactive-match notification fires correctly for an enabled pattern.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Dependencies

None later strictly depends on this. It's a liquidity/retention feature, valuable once VAYA has enough usage history for patterns to actually emerge — sequence it after the core loop (Phases 1-6) is solid and being used repeatedly, not before.

## Risks

Low marginal risk since it's additive to existing schema, but detection-algorithm quality is unproven without real usage data — expect to tune thresholds after observing real (not synthetic) usage patterns, similar to the ride-engine scoring caveat in Phase 4.
