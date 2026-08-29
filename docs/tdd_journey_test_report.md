# VAYA Journey Contract — Test Execution Report

Companion to `docs/tdd_journey_test_matrix.md`. That file maps *what* must be
true; this file records what has actually been **written and run**, its real
pass/fail result, and what that implies about gate completeness per
`.claude/continue-tdd.md`.

**Last synchronized:** 2026-08-29, across two consecutive increments of this
session (a resumption after a prior session was interrupted — see "Session
log" below). All results in this report were re-executed, not carried over
from a prior session's claims (`.claude/continue-tdd.md` §1: "do not assume
an earlier agent's claimed progress is correct — verify the repository").

**Increment 2 update:** continued the Layer-A pass per this report's own
§9 step 1 recommendation. Added 6 more RED contract tests (auto-start,
boarding inference, ETA confidence, live-corridor/route-deviation,
no-show location corroboration, ride-cancellation-after-start guard) —
see §3a/§4a below.

**Increment 3 update (this session's main deliverable):** on explicit
direction — "finish all layers; Postgres/Redis/OSRM are already available
in VAYA" and "tests should reflect the user journey/experience, not test
code implementation" — built and RAN all 10 vertical journeys (`V-01`
through `V-10`) as real Playwright HTTP tests against the live API server,
real Postgres, and real Redis (`tests/e2e/tests/journeys/*.api.test.ts`),
exactly the way the mobile app's own RTK Query client calls the API — no
service functions called directly, no rows inserted straight into Postgres
to fake state. **Result: 12 test cases run, 5 passed, 7 failed — every one
of those 12 results is a real, executed outcome, not a projection.** See
§3b/§4b. This is the single most load-bearing update in this report: it is
the first time this mission's "verification suite" claim is backed by
actual passing/failing runs against the real stack end-to-end, not by
matrix rows inferred from reading source code.

---

## 1. TDD gate status (`.claude/continue-tdd.md` §2)

| Gate item | Status | Notes |
|---|---|---|
| Full specification read | ✅ | `docs/unified_driver_and_passenger_journey.md` (63 sections) |
| Every meaningful requirement has a test mapping | ✅ | `docs/tdd_journey_test_matrix.md` — ~100 IDs (M-/EDGE-/INV-/V-) |
| Important edge cases have tests (mapped) | ✅ (mapped) / ⚠️ (written) | All 11 named edge cases mapped to test IDs; only a handful of the underlying tests are actually written yet (§3 below) |
| Deterministic fixtures exist | ✅ | `tests/fixtures` (`@vaya/test-fixtures`): canonical Madrid→Barcelona corridor, personas, `FakeClock`, GPS fixtures |
| Deterministic time exists | ✅ | `FakeClock`/`CANONICAL_NOW_ISO` — not yet *used* by any test outside the fixture package itself, since no time-sensitive test has been written yet |
| External routing/GPS/push dependencies controlled | ⚠️ PARTIAL | GPS fixtures exist (`fake-gps.ts`) for Layer A. Layer B/vertical journeys deliberately do NOT mock routing — they run against the real OSRM container when it has a prepared graph, and against production's own real haversine-fallback path (never a test-only stand-in) when it doesn't, exactly as a real deployment without OSRM coverage would behave. This environment's OSRM has no prepared Tunisia graph (`docker/osrm/prepare.sh` never run here — a pre-existing, documented limitation, not something this session could fix without a large network download), so every journey below genuinely ran on the haversine-fallback path. |
| Layer A (domain/unit) tests exist where appropriate | ⚠️ PARTIAL (much closer) | 10 contract files exist (3 passing regression-locks + 7 new RED specs across this session's two increments) against ~40+ Layer-A-appropriate matrix rows. Remaining gap: `A.stops.corridor-intent-*`/`joint-optimization-*` (M-004/020/039) and `A.stop-candidates.reject-pedestrian-zone`/`reject-no-stopping-feasibility` (M-014/015) — deliberately deferred, see §9a |
| Layer B (API/integration) tests exist where appropriate | ⚠️ PARTIAL — reframed | No new `apps/api/**/__tests__` service-level integration files were added; instead, per explicit direction this session, the equivalent verification was built at the HTTP/journey layer (§3b) — a real HTTP call through the live server exercises the same API-layer code `apps/api/**/__tests__/*.integration.test.ts` would, while additionally proving the route wiring, auth, and serialization actually work, which a direct service-function call cannot. The ~30 Layer-B-labeled matrix rows not yet covered by a named vertical journey remain open (see §5). |
| Layer C (mobile E2E) tests exist where appropriate | ⚠️ PARTIAL — reframed the same way | No mobile-app-level (React Native / Detox) tests were added. All 10 vertical journeys are real Playwright **HTTP** E2E tests (`tests/e2e`, the project's existing E2E harness) — true user-journey verification of the API contract the mobile app depends on, but not a test of the mobile UI rendering itself. Matrix rows explicitly marked "(inferred) PARTIAL" for presentational/map concerns (M-008/041/045/062, etc.) remain genuinely unverified either way — a real, separate gap this increment does not close. |
| Required vertical journeys exist | ✅ **ALL 10 WRITTEN AND EXECUTED** | `tests/e2e/tests/journeys/journey-{1..10}-*.api.test.ts` — 12 real Playwright HTTP test cases, run once as a full suite this session: 5 passed, 7 failed. See §3b. |
| Required regression tests exist | ⚠️ PARTIAL, meaningfully improved | The 3 pre-existing Layer-A files plus 5 of the 12 vertical-journey cases (V-01, V-04, V-08×2, V-10) now regression-lock real, already-correct behavior (full-route lifecycle, segment-capacity turnover, no-show time-gate + consequence, concurrent-accept atomicity) at the HTTP layer — a meaningfully stronger regression net than a bare service-function call gives, since it also locks in routing/auth/serialization. |
| Tests have been executed | ✅ | See §3, §3b |
| Failures have been classified (A–E) | ✅ | See §3, §3b |
| `docs/tdd_journey_test_matrix.md` is complete | ✅ | Full section/edge-case/invariant/journey coverage, ambiguity log, plus this session's V-01..V-10 results and the M-110 reclassification |
| `docs/tdd_journey_test_report.md` is complete enough to identify gaps/ambiguities | ✅ (this file, as of this session) | |

**Gate verdict: STILL NOT FULLY SATISFIED, but the highest-value piece is now real.** Per
`.claude/continue-tdd.md` §2 ("Do NOT start production implementation
merely because some tests exist... if the gate is incomplete, finish the
test contract first"), **no production code was modified this session** —
every one of the 7 failing journeys documents a real gap, it does not fix
one. What changed this increment: the 10 required vertical journeys — the
part of the gate explicitly meant to be the executable proof that "the
spec is actually achieved" — are no longer a placeholder; they are written,
running, and their pass/fail split is real. The remaining gap before
implementation should start is the ~25 Layer-B matrix rows with no vertical
journey covering them yet (§5), plus the 3 deferred Layer-A areas (§9a).

---

## 2. What existed before this session (recovered, not re-created)

Recovered from the locked worktree `worktree-tdd-journey-contract`
(`.claude/worktrees/tdd-journey-contract`), which is where this entire
mission's state actually lives — the repo's default working directory
(`feat/vaya-command-admin-redesign`) is an unrelated admin-UI branch and was
not touched:

- `docs/tdd_journey_test_matrix.md` — the full requirement-extraction matrix, complete.
- `docs/unified_driver_and_passenger_journey.md` and `docs/product/unified-journey-audit-2026-08-28.md`, copied into the worktree as untracked references (they exist tracked on `main` already).
- `tests/fixtures` (`@vaya/test-fixtures` workspace package): `canonical-corridor.ts`, `personas.ts`, `fake-clock.ts`, `fake-gps.ts` — real, realistic, non-collinear route geometry (Madrid→Zaragoza→Lleida→Barcelona via the real AP-2 alignment), deterministic clock and GPS-fix builders. No changes were needed; this foundation is solid and this session built directly on it.
- 3 domain-layer contract test files (all passing, all regression-locks on *already-correct* behavior, not new capability):
  - `packages/domain/src/booking/__tests__/segment-capacity.canonical-corridor-contract.test.ts` (5 tests)
  - `packages/domain/src/booking/__tests__/cancellation-policy.canonical-corridor-contract.test.ts` (7 tests)
  - `packages/domain/src/pricing/__tests__/compute-suggested-price.segment-pricing-contract.test.ts` (6 tests) — proves the pricing *formula* is already segment-correct; the matrix's real finding (M-070) is that `bookings.service.ts` never calls it per-segment, which is a Layer B gap, not a Layer A one.
- `packages/domain/package.json` had `@vaya/test-fixtures` added as a devDependency (uncommitted); `pnpm-lock.yaml` reflects it.

**Not present before this session:** `docs/tdd_journey_test_report.md` did not exist at all — the gate's own completion tracker was itself an incomplete gate item.

---

## 3. Test execution results, this session

Command: `pnpm --filter @vaya/domain exec vitest run` (packages/domain), Node/pnpm environment freshly `pnpm install`ed this session (no `node_modules` existed beforehand — installed clean, no dependency issues, 34.8s).

| File | Result | Classification |
|---|---|---|
| `segment-capacity.canonical-corridor-contract.test.ts` | ✅ 5/5 pass | **A** — existing behavior already correct |
| `cancellation-policy.canonical-corridor-contract.test.ts` | ✅ 7/7 pass | **A** |
| `compute-suggested-price.segment-pricing-contract.test.ts` | ✅ 6/6 pass | **A** (formula only — see note above; the *wiring* is **B**, untested) |
| `existing-passenger-impact.contract.test.ts` (**new, this session**) | ❌ fails to resolve (`evaluateExistingPassengerImpact` / `existing-passenger-impact-thresholds` do not exist) | **B** — missing required behavior, deliberately written RED per TDD-gate rules (spec test written before implementation) |
| Full `packages/domain` suite (all other pre-existing non-journey tests) | ✅ 136/136 pass, 22/23 files | No regressions introduced by `pnpm install` or the new test file |

No Layer B or Layer C tests were run because none exist yet (this session did not stand up docker/Postgres/Redis/OSRM — that is required infrastructure for the *next* increment of this work, not something this session needed yet since no Layer B test was written).

### 3a. Increment 2 — additional Layer A files

Command: `pnpm --filter @vaya/domain exec vitest run` (packages/domain), same environment, no re-install needed.

| File | Result | Classification |
|---|---|---|
| `trip/__tests__/auto-start-inference.contract.test.ts` (**new**) | ❌ fails to resolve (`evaluateAutoStart` does not exist) | **B** |
| `trip/__tests__/boarding-inference.contract.test.ts` (**new**) | ❌ fails to resolve (`evaluateBoarding` does not exist) | **B** |
| `trip/__tests__/eta-confidence.contract.test.ts` (**new**) | ❌ fails to resolve (`classifyEtaConfidence` does not exist) | **B** |
| `route/__tests__/live-corridor.contract.test.ts` (**new**) | ❌ fails to resolve (`classifyRouteDeviation`/`updateLiveCorridor` do not exist) | **B** |
| `booking/__tests__/no-show-corroboration.contract.test.ts` (**new**) | ❌ 5/5 cases fail at runtime (`evaluateNoShowReport is not a function` — this one resolves as a module but the named export is `undefined`, a different RED signature than the others; still Category B, not a test-infra issue) | **B** |
| `trip/__tests__/cancellation-guard.contract.test.ts` (**new**) | ❌ fails to resolve (`canCancelTrip` does not exist) | **B/C** — the ride-level half is genuinely missing (C, incorrect existing behavior: `cancelRide` never checks trip status at all); the booking-level half already behaves correctly today but via an inlined check rather than this shared predicate, so implementing this file's contract is really "extract + share", not "invent from nothing" |
| Full `packages/domain` suite (all other pre-existing non-journey tests) | ✅ 136/136 pass, 22/29 files | No regressions from any of increment 2's 6 new files |

**Confirmed live during this increment** (not assumed): read `apps/api/src/modules/rides/rides.service.ts`'s actual `cancelRide` (~L301-321) — it calls only `canTransitionRideStatus(ride.status, 'cancelled')`, with zero query against the ride's trip(s) at all. This is a **verified, real bug** matching the matrix's M-101/INV-04 "FAIL (incorrect)" classification, not an inference — a driver can cancel a ride today whose trip is already `active`. Also confirmed `apps/api/src/modules/bookings/bookings.service.ts`'s `assertTripNotStarted` (~L263-268) is correct in behavior but inlines its own copy of the same rule rather than calling a shared `packages/domain` predicate, which is what let the ride-level path skip it entirely — exactly the kind of drift CLAUDE.md's "authoritative state-machine location" rule exists to prevent.

### 3b. Increment 3 — the 10 vertical journeys, real HTTP execution

Prerequisite work done first, live, before writing any journey (per
`.claude/continue-tdd.md` §1's "verify the repository" discipline):

- Confirmed `docker ps`: `vaya-postgres` and `vaya-redis` healthy and running; `vaya-osrm` present but crash-looping (`[error] Required files are missing, cannot continue`) — this environment's OSRM has never had `docker/osrm/prepare.sh` run (no Tunisia `.osrm` graph on disk), a pre-existing limitation this session did not attempt to fix (a multi-hundred-MB download + multi-minute preprocessing step, orthogonal to the test-contract work).
- Ran `npx drizzle-kit migrate` against the real Postgres — succeeded cleanly.
- Ran the pre-existing `apps/api` integration suite as a baseline before adding anything: **256 passed / 6 failed, 32/36 files** (`npx vitest run` in `apps/api`). All 6 pre-existing failures are unrelated to this work and already explained by prior sessions' own notes: 3 need real Google OAuth credentials, 1 (`city-detour-candidates`) and 1 (`stop-candidates`) need the missing real OSRM graph above, 1 (`trip-auto-completion`'s staleness-reminder case) is a pre-existing date-dependent flake. None of these 6 were touched or affected by this session's work.
- Started the real API server (`npx tsx watch src/server.ts`), confirmed `/api/v1/health` reports `database`/`redis` both healthy.

Command: `npx playwright test --project=api journeys/` (`tests/e2e`), against the live server above, run once as a complete suite (after one earlier per-file iteration cycle to find and fix two real test-fixture bugs of my own — see below, not production bugs):

| Journey | Cases | Result | Classification |
|---|---|---|---|
| V-01 full-route | 1 | ✅ PASS | **A** |
| V-02 mid-route | 1 | ❌ FAIL — `contributionTotal` (52 DT) equals the full-route price, not less | **C** — existing implementation (`ride.contributionPerSeat * seatsRequested`, unconditional) contradicts spec §24 |
| V-03 early-segment | 1 | ❌ FAIL — same cause as V-02 | **C** |
| V-04 sequential turnover | 1 | ✅ PASS | **A** |
| V-05 active-trip discovery | 1 | ❌ FAIL — ride absent from search once `in_progress` | **C** — `searchRides` filters `eq(rides.status,'published')` unconditionally |
| V-06 three alternatives | 1 | ❌ FAIL — 4th request returns 200 not 409; siblings stay `pending` after acceptance | **B** — no cross-ride "same journey" concept exists to build this on top of |
| V-07 cancellation (2 cases) | 2 | ❌ FAIL, both — reason-less cancel succeeds (200 not 400); ride-cancel leaves booking `accepted` | **C** (reason) / **C** (cascade) |
| V-08 no-show (2 cases) | 2 | ✅ PASS, both | **A** |
| V-09 pre-boarding privacy | 1 | ❌ FAIL — raw `currentLat`/`currentLng` returned pre-boarding | **C** — `getTrackingState` has no status/role branch at all |
| V-10 capacity race | 1 | ✅ PASS | **A** |
| **Total** | **12** | **5 passed / 7 failed** | |

**Two real test-fixture bugs found and fixed in my own new test code before this final run** (documented for transparency, not production bugs):
1. `journey-1-full-route` initially hardcoded `contributionPerSeat: 12` DT for a route whose real server-computed bound is [31.5, 58.5] DT — the ride-creation call was rejected with a 400 before the journey could even start. Fixed by omitting `contributionPerSeat` and letting the server default to its own `recommended` suggestion (also more realistic — a real driver sees a suggested price, not a hardcoded one).
2. `journey-9-gps-privacy` initially reported the driver's simulated location as exactly equal to the pickup point, which correctly triggered `computeAutoTripStatusTransition`'s real 150m-proximity auto-advance to `pickup` before the privacy assertion ever ran — a false negative caused by my own fixture, not a missing feature. Fixed by moving the simulated location ~14km away (still genuinely pre-boarding, but outside the real proximity radius) and relaxing the status assertion to accept either pre-boarding state.

**A real, load-bearing infrastructure fix needed along the way**: `POST /auth/otp/request` has a genuine 5-requests/minute/IP rate limit (`auth.routes.ts`, "an SMS-cost/spam-abuse surface"), which a 10-journey suite registering ~2-4 accounts each legitimately exhausts. Rather than weaken or bypass this real production control, `journey-helpers.ts`'s `registerAndLogin` now retries on 429 using the server's own advertised `"retry in N seconds"` backoff (`requestOtpWithBackoff`), and `playwright.config.ts`'s per-test timeout was raised to 120s to give that backoff room to actually wait. This is the one config-level change this session made outside the `docs/`/test-file additions — recorded here explicitly since it's technically a change to shared test infrastructure, not a new test.

---

## 4. New test added this session

`packages/domain/src/matching/__tests__/existing-passenger-impact.contract.test.ts`

Specifies the intended pure contract for spec §27/§28 ("Existing Passengers
Have Soft Protection") — matrix IDs **M-083, M-084, M-085 (partially), EDGE-052, INV-09**. 7 cases:

1. The spec's own worked example (+15min on a 3h trip) is acceptable.
2. A substantial delay (+60min on the same 3h trip) is rejected.
3. Multiple existing passengers are each evaluated independently; one violator blocks the request even if others are fine.
4. An empty existing-passenger list is trivially acceptable.
5. The bound is ratio-of-remaining-duration, not a flat-minutes cap (same +15min differs in acceptability depending on the existing passenger's own remaining trip length) — mirrors the already-shipped `MAX_DETOUR_RATIO` shape in `matching-thresholds.ts`, so no new *kind* of config concept is introduced.
6. Thresholds are injected config (§28: admin-configurable), not hardcoded.
7. INV-09 hard-invariant framing: one severe outlier among several fine passengers must still make the whole evaluation unacceptable.

**Deliberately not implemented in this session** — `existing-passenger-impact.ts` and `existing-passenger-impact-thresholds.ts` do not exist, so this file fails to resolve. This is correct/expected TDD RED state, not a defect, and is the reason the file is classified **B** rather than **E** above.

### 4a. New tests added in increment 2

All specify pure `packages/domain` contracts, deliberately not implemented, following the same conventions as increment 1's file (signals/evidence in, decision out, no I/O, config injected not hardcoded where relevant):

- **`auto-start-inference.contract.test.ts`** (M-099/100, spec §35) — `evaluateAutoStart(signals)`: automatic `scheduled → driver_approaching` transition from corroborating evidence (time/origin-proximity/movement/route-progress), single-signal-insufficient. Introduces ambiguity-log entry **A-6** (see matrix) for its "time is a required anchor" interpretation.
- **`boarding-inference.contract.test.ts`** (M-096/097, spec §33, P7) — `evaluateBoarding(signals)`: automatic `pickup → active` transition. Encodes P7's literal sentence ("not from two GPS points briefly becoming close") as a hard gate — `sustainedProximityMet: false` always blocks auto-boarding regardless of any other true signal — while an explicit driver/passenger confirmation tap remains independently sufficient on its own (§33: "buttons... must not be mandatory", not "must not work").
- **`eta-confidence.contract.test.ts`** (M-007, spec P7) — `classifyEtaConfidence(input)`: maps the already-real `TrackingStatus` (live/stale/unavailable/...) plus route-data quality onto the spec's 4-value ETA confidence vocabulary (estimated/confirmed/inferred/unavailable), reusing existing state rather than inventing a parallel one.
- **`live-corridor.contract.test.ts`** (M-090, EDGE-051, INV-08, spec §29/§51) — `classifyRouteDeviation(distanceMeters)` (on_route/noise/real_deviation 3-way split so GPS jitter never reads as a reroute) and `updateLiveCorridor(state, classification, newRoute)` (the hard invariant: `plannedRoute` is never mutated, `liveCorridor` only updates on a genuine deviation).
- **`no-show-corroboration.contract.test.ts`** (M-102, spec §37) — `evaluateNoShowReport(departureAt, reportedAt, evidence)`: extends the already-shipped, already-correct time-only `canReportNoShow` (left completely unmodified) with a location-proximity check, degrading gracefully to time-only behavior when no location fix is available so today's real, working path never regresses.
- **`cancellation-guard.contract.test.ts`** (M-101, INV-04, spec §36) — `canCancelTrip(tripStatus)`: the shared predicate that should replace both `assertTripNotStarted`'s inlined check and `cancelRide`'s current complete absence of one.

### 4b. New infrastructure and tests added in increment 3

**`tests/e2e/tests/support/journey-helpers.ts` (new shared helper module)** — every vertical journey is built on this rather than each re-implementing its own auth/onboarding/ride-creation boilerplate (unlike the single pre-existing `search-to-booking.api.test.ts`, which inlines everything, reasonable for one file but not for ten). Every helper calls the real HTTP API: `registerAndLogin` (real OTP request/verify, with the rate-limit backoff described in §3b), `adminLogin` (the real seeded admin credential), `onboardAndApproveDriver` (real onboarding submission + real admin approval — never an inserted-as-`approved` shortcut), `createAndPublishRide`, `requestBooking`, `acceptBooking`/`declineBooking`, `getTripForBooking`, `startTrip`/`confirmPassengerAboard`/`completeTrip`, `updateTripLocation`/`getTrackingState`, `submitRating`, `cancelBooking`, `reportNoShow`, `searchRidesAsRider`. Also exports the real Tunis/Hammamet/Sousse/Monastir corridor points (chosen to match this codebase's own pre-existing integration-test conventions and VAYA's actual market, rather than the Layer-A fixture package's Madrid-Barcelona geometry, which is Spain-based and exists for pure-domain math tests only).

**10 vertical-journey files, `tests/e2e/tests/journeys/journey-{1..10}-*.api.test.ts`** — one per matrix `V-` ID, each a real script of what a specific driver/passenger actually does and sees (never a call to a service function or a direct DB row insert to fake state):

1. **journey-1-full-route** — publish → search → request → accept → start → board → complete → both rate each other → trust summary reflects it.
2. **journey-2-mid-route** — driver adds real intermediate stops (`POST /rides/:id/stops/custom`, `role: 'via'` — chosen deliberately over relying on OSRM-generated candidate stops, since this environment's OSRM has no prepared graph; `via` stops project onto whatever route geometry exists, real or haversine-fallback, so this works either way); passenger books a strict sub-segment; asserts the real spec claim (segment price < full price).
3. **journey-3-early-segment** — the origin-side mirror of journey-2.
4. **journey-4-sequential-turnover** — a single-seat ride; passenger A takes the first leg, passenger B still books a later non-overlapping leg on the very same seat.
5. **journey-5-active-trip-discovery** — a real trip is started and a real position update is posted; a second passenger searches the remaining corridor.
6. **journey-6-three-alternatives** — 4 different drivers publish the same corridor; one passenger requests 3, then attempts a 4th; the 2nd driver accepts first.
7. **journey-7-cancellation** — (a) cancel with no reason; (b) driver cancels the whole ride with an accepted booking on it.
8. **journey-8-no-show** — too-early report rejected; genuine report after the grace period succeeds with a real rating consequence.
9. **journey-9-gps-privacy-and-uncertainty** — a not-yet-boarded passenger polls tracking state while the driver genuinely broadcasts a position.
10. **journey-10-capacity-race** — two real, simultaneous HTTP accept requests that together exceed capacity.

**`playwright.config.ts`**: added a top-level `timeout: 120_000` (was the 30s default) with a comment explaining why (the OTP backoff in §3b needs the headroom). No other config changes.

---

## 5. Remaining failing / not-yet-written tests

This is the honest, current size of the remaining test-contract work, derived directly from `docs/tdd_journey_test_matrix.md`'s "Current result" column:

**Layer A (pure domain) — remaining after increment 2, 3 areas (down from ~15):**
`A.stops.corridor-intent-*` (M-004/020), `A.stops.joint-optimization-*` (M-039), `A.stop-candidates.reject-pedestrian-zone` / `reject-no-stopping-feasibility` (M-014/015) — see §9a for why these three are deliberately deferred rather than rushed.

*(Resolved into RED contract tests across increments 1-2: `A.existing-passenger-impact.*` (M-083/084), `A.route-concepts.*` (M-090, EDGE-051), `A.gps.no-fabricated-certainty` (M-007), `A.boarding.*` (M-096/097), `A.lifecycle.auto-start-*` (M-099/100), `A.no-show.requires-time-and-location-*` (M-102), `A.cancellation.ride-cancel-rejected-after-start` (M-101).)*

**Layer B (API/integration) — now PARTIALLY covered via the vertical journeys** (§3b/§4b) rather than zero: `INV-06` (raw GPS pre-boarding, journey-9), the P0 active-trip gap (`M-091`, journey-5), cross-ride sibling-cancel (`M-055`/`INV-03`, journey-6), and ride-cancel propagation (`EDGE-046`, journey-7) are now proven live, not just mapped. Genuinely still open, no journey or test covers them yet: `B.matching.route-passthrough-without-driver-stops` (INV-07 — a driver-selected stop is not REQUIRED for a match; the `detour_match` tier may already partially address this via free-form pickup + live detour validation in `createBooking`'s `assertRealDetourWithinAllowance` path — confirmed to exist in code this session but not yet exercised by a real test, so its actual current behavior is still unverified, not assumed FAIL as the matrix's pre-session classification says), `B.booking.deadline-visible-to-*` (M-054, no `expiresAt` field exists at all — confirmed by inspecting the booking response shape used throughout this session's journeys, none of which ever saw one), `B.admin-config.*` (M-085/086), and the remaining ~20 matrix rows in sections 7-45 with no journey exercising them (route alternatives, pickup/dropoff joint optimization, notification-event coverage, messaging, most of the driver-inbox/request-detail shape checks).

**Layer C (true mobile-UI E2E) — still zero.** All 10 vertical journeys are real HTTP-level E2E (Playwright against the live API), which is the layer this session's explicit direction ("test the user experience over implementation") calls for — but they do not touch React Native rendering. Matrix rows marked "(inferred) PARTIAL" for presentational/map concerns (M-008/041/045/062, etc.) remain genuinely unverified either way; closing this would need Detox/Maestro or similar against a real device/simulator, out of this session's scope.

**Vertical journeys — ALL 10 WRITTEN AND EXECUTED** (§3b). 7 of 12 cases fail, each confirming a real, previously-only-inferred gap; 5 pass, confirming real, already-correct behavior at the full HTTP-stack level. This is no longer open work — see §3b for the complete, final table.

---

## 6. Production behavior implemented this session

**None.** Per gate rule, no production code (`apps/api`, `apps/mobile`, `packages/domain` non-test files) was created or modified across any of this session's three increments — including increment 3, where 7 of 12 real HTTP journeys failed against real, unmodified production code. The only repository changes this session are: this report, the matrix, the new Layer-A test files, the new vertical-journey test files and shared helper, and `playwright.config.ts`'s timeout bump.

---

## 7. Architectural decisions made this session

- Confirmed the correct place to continue this mission is the locked worktree `.claude/worktrees/tdd-journey-contract` (branch `worktree-tdd-journey-contract`), **not** the default working directory, which is mid-flight on an unrelated admin-redesign branch. All work happens there; nothing was touched outside it.
- The new `existing-passenger-impact` contract deliberately reuses the *shape* of the already-shipped `matching-thresholds.ts` (`MAX_DETOUR_RATIO` + floor/ceiling), rather than inventing a new configuration idiom, to keep a future admin-configurable-thresholds implementation (M-085/§28) consistent with the one pattern that already exists for this exact kind of value.
- No new judgment call was made on ambiguity log items A-1..A-5 (`docs/tdd_journey_test_matrix.md`) — they remain open product questions, unchanged from the prior session's framing.
- **Vertical journeys test the real HTTP API, never internal service functions or direct DB rows** (explicit direction this session: "test the desired user experience... not testing the code implementation"). Concretely this meant: real OTP login (not a JWT minted by hand), real driver onboarding + real admin approval (not an inserted `verificationStatus: 'approved'` row), real `POST /rides` + `POST /rides/:id/publish` (not a direct `insert()` into the `rides` table). The one place this session used a slightly lower-level mechanism — `POST /rides/:id/stops/custom` with `role: 'via'` instead of the full candidate-generation flow — is still a real endpoint a driver's app calls (the "add a stop along your route" map-tap flow), chosen only because it doesn't require a working OSRM graph, not because it skips the HTTP layer.
- **Real Tunisia geography for all Layer-B/journey work**, not the Layer-A fixture package's Madrid-Barcelona corridor — consistent with every pre-existing `apps/api`/`tests/e2e` integration test in this codebase and with VAYA's actual market. The two fixture sets serve different purposes and were kept deliberately separate rather than unified.
- **Real rate-limit backoff, not a bypass**, for the OTP-registration bottleneck across 10 journeys (§3b) — chosen over disabling/raising `auth.routes.ts`'s real rate limit for tests, which would have meant the test suite no longer exercises the same constraint a real burst of signups would hit in production.
- Chose to run all 10 journeys as one Playwright suite rather than 10 isolated single-file runs for the final confirmed result, so the reported 5/12 pass rate reflects one real, reproducible run rather than results assembled from separate debugging sessions (two of which needed a fixture fix first — see §3b).

---

## 8. Remaining specification ambiguities

Carried forward unchanged from `docs/tdd_journey_test_matrix.md`'s ambiguity log (A-1 through A-5) — re-verified as still open, no new ambiguity surfaced this session beyond one clarification-adjacent note:

- **A-2 (§27/28 "substantial" delay threshold)** is the one this session's new test directly exercises. The spec's single example (+15min/3h ≈ 8.3%) was used as the RED test's boundary-adjacent acceptable case and a clearly-over-threshold case as the rejection case; the exact curve (ratio-only vs. ratio-with-floor/ceiling vs. something else) is still an open product decision, not resolved by writing the test.
- **Not an ambiguity, but a finding of the same shape — M-110's classification was simply wrong, corrected this session:** the matrix previously marked "a lightweight reason is required" for cancellation as PASS, on the strength of the mobile `CancellationSheet`'s real fixed-reason-picker UI. Increment 3's journey-7 proved live that the server accepts a cancellation with zero reason (200, not the spec-implied 400) — the UI reason picker is never transmitted anywhere. This isn't a spec ambiguity to document; it's a stale classification now corrected in the matrix (§38/M-110 row, and the coverage summary).

---

### 9a. Why the 3 remaining Layer A areas are deliberately deferred, not skipped by oversight

- **`A.stops.corridor-intent-*` / `joint-optimization-*` (M-004/020/039):** the spec's actual claim ("a driver-selected stop communicates corridor willingness, not a fixed coordinate; VAYA later resolves the real point via a joint passenger/driver optimization") is a genuinely different shape from every function specified so far — it needs a real multi-objective scoring model (passenger walk/PT convenience AND driver detour/feasibility, evaluated together, not sequentially), not a threshold/signal-counting predicate. Writing a shallow version now risks encoding an under-designed formula that a later session then has to un-teach itself from — worse than leaving it honestly not-yet-specified.
- **`A.stop-candidates.reject-pedestrian-zone` / `reject-no-stopping-feasibility` (M-014/015):** these require a real signal source (OSM tags, or equivalent) that doesn't exist in this codebase yet — `stop-candidates.service.ts` currently only has speed-inferred road classification (confirmed in the matrix's own M-013 note: "OSRM's responses carry no way-class tag at all"). A pure function here would need a fixture representing that missing signal, which risks specifying the wrong shape before knowing what data will actually be available.

Both are flagged here explicitly rather than silently dropped, per `.claude/continue-tdd.md` §3's "if genuinely ambiguous, document the ambiguity instead of silently deciding."

---

## 9. Work still required (in TDD-gate order, per `.claude/continue-tdd.md` §3–§6)

1. **Finish the Layer A pass** — 3 areas remain (§5, §9a): stop corridor-intent/joint-optimization (M-004/020/039) and pedestrian-zone/no-stopping-feasibility rejection (M-014/015). Both need genuine design work first, not mechanical pattern-following.
2. **Extend the vertical-journey suite to the remaining ~20 uncovered Layer-B matrix rows** — the highest-value P0/invariant journeys are now done (§3b); what's left is narrower in scope: route alternatives/selection, deadline visibility (`M-054`, needs `expiresAt` to exist first), admin-configurable thresholds, notification-event coverage (12 named events, only some verified), messaging, and the `INV-07`/`detour_match` free-form-pickup path specifically flagged in §5 as "exists in code but not yet exercised by a test" — that one is worth checking before assuming it's still broken, since the matrix's original FAIL classification predates this session's discovery that `createBooking` already has a live-detour-validated free-form-pickup branch.
3. **True Layer C (mobile-UI) E2E** stays the lowest priority, per the matrix's own "(inferred)" framing and this session's explicit "user experience over implementation" direction being already substantially served by the HTTP-level journeys.
4. Only once the gate above is genuinely satisfied: begin production implementation, in the order `.claude/continue-tdd.md` §6 specifies (data integrity → matching → segment capacity → pricing → booking/grouping/concurrency → deadlines → cancellation/no-show → lifecycle → active-trip matching → tracking/GPS → boarding → route deviation → notifications → journey APIs → mobile UX → polish). **When that work starts, the 7 failing journeys in §3b are the executable acceptance criteria for the corresponding fixes** — a fix is done when its journey turns green, not when the code merely "looks right."

This session's main deliverable (all 10 vertical journeys, real and executed) directly answers the mission's own stated goal: a reliable E2E suite that verifies the spec is actually achieved. It is not yet a COMPLETE such suite (step 2 above lists the real remaining gaps), but it is the first point in this mission where that claim is backed by actual runs rather than a plan to eventually run something.

---

## 10. Further Layer-B extension (separate increment — resumed session, worktree re-entered mid-flight)

**Context**: this increment resumed work in the same worktree after finding it already at the state described in §1-9 above (commit `f2147a9`, clean working tree, nothing lost). Per this whole mission's own "verify the repository, don't trust prior claims" discipline, every claim below was executed and observed in this increment, not carried over. A concurrent peer session (`review/tdd-journey-contract-pass2`, based on the same `f2147a9`) worked in parallel in a *separate* worktree on a distinct second-pass audit (spec §28 rewrite, matrix hygiene) — coordinated via cross-session messages, no file collisions; that branch is not merged into this one and its own findings are its own report section, not duplicated here.

### 10.1 New tests added, all real and executed against real Postgres

| File | Result | Classification | What it proves |
|---|---|---|---|
| `packages/domain/src/matching/__tests__/matching-thresholds.admin-config-contract.test.ts` | ✅ 4/4 pass | **B** (documents a real gap via a passing structural test) | `getMatchingThresholds`/`detourAllowanceSec` take no config/override parameter at all; `MAX_DETOUR_RATIO` is a hardcoded module constant — M-085 (admin-configurable matching thresholds) is genuinely MISSING, confirmed by direct inspection of the real exported functions, not inference. |
| `apps/api/src/modules/notifications/__tests__/notification-event-coverage.contract.test.ts` | ✅ 14/14 pass | **B** | Reads the real `notificationEventTypeEnum` (no DB connection needed — a schema-level structural check). Confirms exactly 4 of spec §39's 12 named events have **no event type in the schema at all** (deadline-approaching, siblings-cancelled, passenger-onboard, route/ETA-changed) — not merely undispatched, structurally absent. 2 more are deliberate, documented reuse (trip-started→`trip_driver_approaching`, review-requested→`trip_completed`). |
| `apps/api/src/modules/bookings/__tests__/bookings-deadline-visibility.contract.integration.test.ts` | ✅ 2/2 pass | **B** | Real Postgres row + real `createBooking` return value: confirmed no `expiresAt`/`deadline`/`responseDeadline` field exists anywhere in the response shape or the persisted row. M-054 confirmed MISSING live, not by reading the schema file alone. |
| `apps/api/src/modules/bookings/__tests__/bookings-inv07-stop-not-required.integration.test.ts` | ✅ 2/2 pass | **A/B mixed — see 10.2** | See below — this is the most consequential finding of this increment. |

Command: `npx vitest run <file>` per file (apps/api), plus one full `packages/domain` re-run (`npx vitest run`): **140 passed / 5 failed, 23/30 files** — the 5 failures are the same pre-existing RED specs from §3a (auto-start, boarding, ETA-confidence, live-corridor, no-show-corroboration), unchanged; no regressions from this increment's 2 new domain files.

### 10.2 M-021 / EDGE-054 / INV-07 reclassified: PARTIAL, not blanket FAIL

The original matrix (and the audit it was built from) classified "a driver-selected stop is not required for a feasible match" as a clean **FAIL (incorrect)**, citing `matching.service.ts`'s `route_passthrough` tier hard-requiring stops on both ends (`scorePassThroughCandidates`'s `continue` when `rankedStops.length === 0`, confirmed still true at ~L634).

That citation is accurate but incomplete — it answers "can *search's primary tier* find this ride," not "can the invariant ever actually be satisfied end-to-end." Two further, real code paths change the answer:

1. **`bookings.service.ts`'s `createBooking`** has a free-form-pickup branch (~L405-419) that places **zero** stop requirement on a ride with no `route_stops` rows at all — confirmed live by `bookings-inv07-stop-not-required.integration.test.ts`: a booking with an arbitrary mid-route pickup point, on a ride with zero stops, succeeds unconditionally, no distance/detour bound applied.
2. **`matching.service.ts`'s `scoreDetourCandidates`** (the `detour_match` tier) explicitly does *not* require stops — it runs a real routing-engine waypoint-insertion call instead. It is gated two ways, though: it only runs when the merged exact/wide/passthrough stage is *completely* empty (an existing, separately-flagged architecture concern — §5 of the original audit, "worth a cheap global-best refactor"), and it discards any candidate whose routing call comes back `isEstimate: true` (i.e. no real OSRM/Google reachable) — confirmed by reading the code (`if (withInsertion.isEstimate) continue;`).

**Net finding**: INV-07 genuinely **PASSES** at the booking layer (unconditionally, for a zero-stop ride) and is **PARTIALLY** satisfied at the search layer (only via the last-resort `detour_match` fallback, itself dependent on a real reachable routing engine). This environment's OSRM container has never had a prepared graph (`docker/osrm/prepare.sh` never run — the same pre-existing limitation §3b/§9a already documented for other tests), so the search-layer half could not be exercised live here — that specific half is a **Category E (test-infrastructure gap)**, not assumed to still be a defect and not assumed to be fixed. The matrix (M-021, EDGE-054, INV-07 rows) has been updated to PARTIAL with this precise reasoning, replacing the prior blanket FAIL.

**A genuine, separate asymmetry found along the way** (documented in the test file, not asserted as either correct or incorrect): a free-form **dropoff** (unlike pickup) is *always* live-detour-validated via `assertRealDetourWithinAllowance`, regardless of stop count — so a zero-stop, zero-route-polyline ride can accept a free-form pickup but rejects a free-form dropoff outright ("This ride has no route to validate a detour against"). Confirmed live, not inferred. Worth a product/engineering decision on whether that asymmetry is intentional.

### 10.3 Updated gate-status delta

Relative to §1's table: Layer B coverage is no longer "PARTIAL — reframed" with zero direct `apps/api/**/__tests__` additions — 4 new real, executed integration/contract files now exist there, closing 4 of the ~20 previously-open Layer-B matrix rows (M-054, M-085, M-086, M-113) plus refining 3 more (M-021, EDGE-054, INV-07). Remaining open Layer-B rows (route alternatives/selection shape, messaging, remaining driver-inbox/request-detail field-completeness checks) are unchanged from §5's list and not claimed as done here.

No production code was modified in this increment either — same discipline as every prior increment.
