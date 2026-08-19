# Cancellation & No-Show Policy (Phase 10)

Full scope: `docs/roadmap/phase-10-cancellation-no-show.md`. This document is
the resolution of `docs/roadmap/README.md`'s Open Decision #4 — VAYA's own
cancellation-policy design, decided autonomously during the Phase 10 session
since no human was available to consult. Treat the exact tier boundaries and
point weights below as a reasoned first cut, explicitly **pending real-world
tuning** once VAYA has real cancellation/no-show volume to look at — not a
permanently settled business rule.

## Why not BlaBlaCar's policy

`docs/product/benchmark.md` §2 documents BlaBlaCar's cancellation policy:
>24h before departure → refund minus service fee; booked >24h out but
cancelled inside the last 24h → 50% refund to passenger / 50% compensation to
driver; booked within 24h and cancelled within 30 minutes of booking → full
refund minus fee. **All three tiers are monetary.** VAYA has no payment
system yet (`docs/domain/pricing.md`'s `contributionPerSeat` is a suggested
in-person cash amount, never processed by the platform) — there is nothing to
refund, and nothing to withhold. Copying the percentages verbatim would be
meaningless. What VAYA can meaningfully do today is the same thing every
marketplace without a payment rail has: **make cancellation consequences
reputation-based**, informed by BlaBlaCar's >24h / <24h / <30min time
structure (a market-tested signal of how much notice actually matters), not
its monetary mechanics.

## The three tiers

Computed by `packages/domain/src/booking/cancellation-policy.ts`'s pure
`computeCancellationPolicy(departureAt, cancelledAt)`:

| Tier | Window (before departure) | Consequence |
|---|---|---|
| **free** | ≥ 24h | None. Cancelling with a full day's notice is normal marketplace behavior. |
| **moderate** | < 24h, ≥ 30min | +1 reliability penalty point. Does **not** affect the rating average. |
| **severe** | < 30min (including after departure) | +3 reliability penalty points. Still not an automatic low rating. |

**No-show** (a distinct action from cancellation — see below) is weighted
heavier than even the severe cancellation tier: **+5 reliability penalty
points, plus an automatic 1-star rating** for the no-show party
(`NO_SHOW_PENALTY_POINTS`, `NO_SHOW_AUTOMATIC_RATING_STARS`).

### Reasoning for the shape (not just the numbers)

- **Free cancellation stays free.** Charging any reputation cost for a
  well-notified cancellation would just teach users to stop cancelling
  honestly and silently no-show instead — strictly worse for the other
  party, who'd rather know 25 hours out than find out nothing at all.
- **A late cancellation is honest, if inconvenient — a no-show is not.**
  Both a severe-tier cancellation and a no-show leave the other party in a
  bad spot, but the cancelling party in the former case still *told* them.
  That's why no-show is weighted higher and is the only outcome that
  triggers an automatic low rating: rating is a *quality/trust* signal, and
  silently failing to show is a worse trust signal than cancelling late.
- **Points, not a fabricated 0-1 score.** `reliabilityPenaltyPoints` is a
  raw, monotonically-increasing integer count — not normalized against trip
  volume into a polished-looking score. This is a deliberate honesty choice
  (CLAUDE.md's "never show fabricated success/precision" principle applies
  to internal signals too): with no real usage data yet, presenting a
  precise-looking 0-100 "reliability score" would fabricate confidence the
  underlying signal doesn't have. A future phase can normalize this once
  there's enough volume to make normalization meaningful.

## Storage

`reliabilityPenaltyPoints` (integer, default 0) was added to both
`driver_profiles` and `rider_profiles` (migration `0009_nasty_boomerang.sql`,
additive-only, per CLAUDE.md's schema rules). **Deliberately not reusing**
`driver_profiles.reliabilityScore` (Phase 9-era, written by
`ratings.service.ts`'s `recomputeDriverAggregates` as a rating-derived
value equal to `punctualityScore`): that column is *recomputed from scratch*
on every new rating, so writing a cancellation penalty into it would be
silently erased the next time either party submits a rating. The two are
deliberately separate reliability *signals* (rating-derived punctuality vs.
cancellation/no-show history) until real evidence justifies merging them
into one score — see CLAUDE.md's architecture principle: "complexity is
added when evidence justifies it, not preemptively."

Applied via `ratings.service.ts`'s `applyCancellationPenalty` (a plain
`+= points` update, or a lazy upsert for a rider with no `rider_profiles` row
yet — mirrors `recomputeRiderAggregates`' own lazy-creation pattern) — kept
in the ratings module, not a new one, since it's the same
"reputation-consequence write" concern Phase 9 already owns, not a second
parallel mechanism.

## The no-show business rule

A no-show cannot be reported before `departureAt` at all, plus a further
15-minute grace buffer (`NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE`) — enforced
server-side by `packages/domain`'s `canReportNoShow(departureAt, reportedAt)`
and re-checked in `bookings.service.ts`'s `reportNoShow`, independent of
whatever the mobile UI does. The buffer is deliberately shorter than the
30-minute severe-cancellation boundary: by 15 minutes past departure, a
genuine no-show is already highly likely, and the UI's own guidance text
("try to contact them first") is expected to have already happened by then,
not to still be in progress.

The mobile no-show affordance (`NoShowReportSheet`) surfaces the contact-first
guidance as **text, not a technical gate** — exactly the phase doc's explicit
instruction ("a hard technical gate in v1" was ruled out). The real
enforcement point is entirely server-side.

## No-show vs. cancellation: distinct actions

`reportNoShow` is a materially different action from `cancelBooking`, not a
fourth cancellation tier:

- **Cancellation** is self-reported ("I am withdrawing") by either party.
- **No-show** is other-reported ("the other party never showed") by either
  party, about the *other* party.

Both feed `bookings.status` (`cancelled_by_rider` / `cancelled_by_driver` vs.
`no_show` — all three already existed in the schema before this phase, per
`docs/roadmap/phase-10-cancellation-no-show.md`'s framing) and both release
the booking's held seat back to the ride atomically (see below), but only
`reportNoShow` inserts the automatic low rating.

`packages/domain/src/trip/trip-status.ts`'s `no_show` transition was widened
this phase to be reachable from every non-terminal trip status, not only
`pickup` — mirroring Phase 9's identical widening of the `completed`
transition, for the identical reason: this codebase's trip-progress screens
(`bookings/pending → pickup → live → settlement`) are still a presentational
mock with no live position feed driving a trip through the intermediate
statuses one at a time, so a no-show reported near `departureAt` will almost
always find the trip still sitting in `scheduled`.

## Atomicity: a second race this phase found and fixed

`cancelBooking` (Phase 1 through Phase 9) guarded its status transition only
with an application-level `canTransitionBookingStatus` check against a
**stale** read of the booking, then updated the row unconditionally by id.
Two concurrent cancel attempts on the *same* booking (e.g. rider and driver
racing to cancel at once) could both pass that stale check and both
"succeed" — and both then take the seat-restore branch, **double-crediting**
`rides.seatsAvailable` for a single freed seat. This phase closes that
window by re-validating `status` inside the `UPDATE ... WHERE` clause itself
(`WHERE id = :id AND status = :expectedStatus`), the same discipline Phase
1's `acceptBooking` fix already established for the seat-decrement race: the
first writer to commit wins, the second's `WHERE` matches zero rows, and it
gets a clean `ConflictError` instead of corrupting seat counts. The identical
fix was applied to `reportNoShow`. Proven directly by a concurrent-cancel
integration test
(`apps/api/src/modules/bookings/__tests__/bookings-cancellation.integration.test.ts`),
mirroring Phase 1's original `acceptBooking` race test.

## API shape

- `GET /bookings/:bookingId/cancellation-preview` — read-only, computes the
  tier/consequence that would apply *right now*, never mutates anything.
  Exists so the mobile cancellation sheet can show the consequence *before*
  the user commits (the phase doc's explicit "no surprise outcomes"
  requirement) without needing a dry-run flag on the destructive endpoint.
- `POST /bookings/:bookingId/cancel` — mutates, and returns the
  authoritative final `cancellationPolicy` actually applied (computed at the
  instant of mutation, which may differ slightly from an earlier preview if
  the user waited before confirming).
- `POST /bookings/:bookingId/report-no-show` — mutates; returns the updated
  booking.

## What is deliberately out of scope (per the phase doc)

- No monetary refund/compensation mechanism, and no `cancellation_id`/audit
  trail table — explicitly deferred until/if a payment system exists
  (`docs/roadmap/phase-10-cancellation-no-show.md`'s Database section).
- `reliabilityPenaltyPoints` is not yet surfaced anywhere in the UI (not
  even the trust-summary endpoint) — this phase's scope was the mechanism
  and its consequences, not a new reputation display surface. A future
  phase can decide how/whether to expose it once there's a design reason to.
- Driver-side entry points: every cancellation/no-show affordance built this
  phase lives on rider-facing screens (`(tabs)/trips.tsx`,
  `bookings/pending|pickup|live.tsx`) because those are the only per-booking
  screens that exist in this codebase today — the same "no driver-side
  trip-execution screen yet" gap Phases 7, 8, and 9 already documented. The
  backend (`cancelBooking`/`reportNoShow`) already supports either party;
  only the mobile entry points are rider-only for now.
