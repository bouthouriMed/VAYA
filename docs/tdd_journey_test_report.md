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

**Increment 4 (§10, concurrent session):** while this pass was underway, the
`worktree-tdd-journey-contract` session itself kept going and extended Layer-B
coverage directly on this branch (4 new real, executed tests: admin-config gap,
deadline-field absence, notification-event coverage, and an M-021/EDGE-054/INV-07
reclassification from blanket FAIL to PARTIAL). See §10 below.

**Increment 5 (§11, this pass — second-pass audit, explicit "do not implement yet"
mandate):** a separate session's mandate, run in a fresh worktree
(`review/tdd-journey-contract-pass2`, based on this branch's pushed `f2147a9`,
later rebased onto §10's commit `b26c268`) rather than more coverage: audit the
prior increments' new tests for values that accidentally became permanent
product rules instead of testing configured behavior; make VAYA's
operational-policy-configuration model explicit in the spec itself;
strengthen the matrix's test-layer taxonomy; tighten one under-specified
assertion; and classify every current failure. No production code touched.
Full detail in §11 below.

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

---

## 11. Second-pass audit (Increment 5) — findings, spec update, and gate re-classification

Explicit mandate for this pass: **do not begin production implementation.**
Re-audit increments 2-3's test contract against the spec for accidentally-hardcoded
business rules, make the spec's operational-policy-configuration model explicit,
strengthen the matrix, close the clearest remaining gaps with a small number of
targeted tests, and classify every current failure. Everything below was verified
live in this pass (re-read files, re-ran the suite), not carried over from a claim.

### 11.1 Files created or modified this pass

- `docs/unified_driver_and_passenger_journey.md` — §28 rewritten as "Admin
  Configuration — VAYA Operational Policy Configuration": explicit statement that
  VAYA (not passengers, not ordinary drivers) owns every matching/lifecycle/timing
  threshold; the Admin Panel is the authoritative configuration interface; every
  domain function reading a threshold must accept it as an injected parameter, not
  a bare literal or un-parameterized constant; any specific number elsewhere in the
  spec (including the +15min/3h worked example and the current 24h/30min/15min
  cancellation/no-show defaults) is a current default, not a fixed requirement;
  tests must validate against the named default/injected value, never a
  re-frozen literal; and a documented placeholder for future driver-level premium
  overrides.
- `docs/tdd_journey_test_matrix.md` — added a "Test layer taxonomy" paragraph
  making the domain/unit-vs-vertical-integration distinction explicit (mission
  Step 3); broadened M-085's scope to name cancellation/no-show timing and
  request-expiry explicitly; added new row **M-085a** (architecture requirement:
  thresholds must be injectable) with a live verification of which existing
  functions already comply (`evaluateExistingPassengerImpact`,
  `detourAllowanceSec`) and which do not (`computeCancellationPolicy`,
  `canReportNoShow` — exported constants, but no override parameter at all).
- `packages/domain/src/booking/__tests__/cancellation-policy.canonical-corridor-contract.test.ts`
  — fixed: replaced bare literals (`24 * 60`, `30`, `14`, `15`) with the module's
  own exported `CANCELLATION_FREE_WINDOW_HOURS`/`CANCELLATION_MODERATE_WINDOW_MINUTES`/
  `NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE` constants — this is exactly the mission's
  "Do NOT do this" example (24h/30min/15min as bare literals), found in a
  pre-existing regression-lock test, not newly introduced. Behavior asserted is
  unchanged; the test now tracks the configured default instead of re-freezing it.
- `packages/domain/src/booking/__tests__/segment-capacity.canonical-corridor-contract.test.ts`
  — the 4-passenger-mix test asserted only `<= seatsTotal` where the exact peak
  occupancy was fully known and computable (mission Step 11's explicit instruction).
  Replaced with an exact `toBe(2)` assertion (worked out by hand from the real
  segment overlaps, documented in the test) plus a new second test proving a
  5th, genuinely-overlapping request is rejected only once it truly exceeds
  capacity (exact peak `4` when it does exceed; exact peak `3`, accepted, at the
  boundary) — closes the "assert exact expected occupancy, not merely <=
  capacity" gap for the one place it existed.

### 11.2 Requirements covered by this pass

- Step 1 (audit for accidentally-hardcoded values): all 7 new Layer-A contract
  files + all 10 vertical journeys reviewed line-by-line. One real violation found
  and fixed (§11.1, cancellation-policy test). One representation flagged and
  cleared as *not* a violation (see §11.4). No hardcoded-threshold issues found in
  any vertical journey (they assert HTTP status codes and structural shape, not
  magic distance/time literals).
- Step 2 (spec configuration section): done, §28 of the spec (§11.1).
- Step 3 (matrix completeness/taxonomy): done — taxonomy paragraph + M-085/M-085a
  (§11.1). The rest of the matrix was independently re-read against the spec's
  63 sections and found already complete (~100 IDs, all sections/edge-cases/
  invariants mapped) — no missing spec requirement was found lacking a matrix row.
- Step 11 (exact segment occupancy): the one under-specified assertion found
  and fixed (§11.1).
- Steps 4/5/9/10/13/14 (driver publishing, partial-route discovery, active-driver
  P10, dynamic pricing, trip state machine, no-show): verified already
  substantively covered by increments 2-3's work (M-010..M-022, V-02/V-03,
  boarding-inference/auto-start-inference contract tests, V-05/V-09,
  no-show-corroboration contract test) — re-derived independently in this pass
  rather than assumed from the prior report, no gaps found beyond what §5/§9a
  already document as open.

### 11.3 Requirements still missing from the test contract (genuine gaps, not invented)

- **Step 6 (ranking order as a single invariant):** M-038's four
  `best-fit-changes-with-X` tests validate sensitivity per dimension but no test
  asserts the combined ordering guarantee (exact match ranked at least as well as
  a strong partial match, ranked above an acceptable alternative; an unacceptable
  alternative is never silently promoted; a feasible alternative is never dropped
  to an empty result). **Deliberately not invented this pass**: no pure ranking
  function exists in `packages/domain` to test against (confirmed by search) —
  "Best Fit" scoring lives entirely inside `apps/api/src/modules/matching`, a
  service, not a domain module. Writing a Layer-A test would mean guessing at a
  function signature that doesn't exist yet, which the mission's own "do not
  invent product rules" instruction rules out. This needs either (a) a real
  Layer-B/vertical journey against the live search endpoint asserting ordering
  over a multi-driver fixture (closest in shape to V-06's multi-driver setup), or
  (b) extracting a pure ranking function into `packages/domain` first — a design
  decision, not something this pass should decide unilaterally.
- **Step 16 (cross-screen information consistency):** genuinely zero coverage.
  The matrix has many *shape* checks per surface (e.g.
  `B.search-result.itinerary-shape-ordered`, `B.request-detail.driver-detail-shape-complete`)
  but no test that takes one real booking and asserts the *same* segment price /
  passenger route / ETA is identical across search result, passenger booking
  confirmation, driver request detail, and driver itinerary responses. This is a
  real, distinct requirement (the spec's own "a passenger-specific route must
  never silently become the driver's full route in a downstream screen" language)
  that no existing V- journey happens to exercise as a cross-surface assertion.
  Not invented here — would need a new vertical journey, `V-11` or folded into an
  existing one, fetching the same booking through 3-4 different endpoints and
  diffing the shared fields.
- **Step 7 (passenger pickup/dropoff override recalculation):** confirmed
  still `FAIL (missing)` at M-040 — no override mechanism exists at all today
  (a passenger can only choose among a driver's pre-set stops), so there is
  nothing yet to write a meaningful contract test against beyond restating the
  absence. Left as a matrix-tracked gap, not stubbed with a speculative test.

### 11.4 Current test results (this pass, `pnpm --filter @vaya/domain exec vitest run`)

29 test files, 142 test cases (was 141 before this pass's new segment-capacity
case): **22 files / 137 cases passed, 7 files failed to fully resolve (6 RED
"module does not exist yet" + 1 RED "resolves but export is undefined") / 5
cases failed within the 1 partially-resolving file.** Exactly the expected,
unchanged shape from increments 2-3 (confirmed: my edits to the 2 pre-existing
passing files did not regress them — both still pass, one with an added case).
Vertical journeys (`V-01..V-10`, `tests/e2e/tests/journeys/`) were **not
re-executed this pass** — no file under `tests/e2e` was touched, and re-running
the full live-server/Postgres/Redis suite would reproduce, at real infrastructure
cost, results already captured live in §3b/§4b of this report by the session that
wrote them. Their **5 passed / 7 failed** result is carried forward by reference,
not re-verified redundantly.

### 11.5 Every failure classified A/B/C/D

Per this pass's own classification scheme (A = existing correct behavior,
B = genuine missing implementation, C = test/spec mismatch, D = configurable
behavior the test wrongly assumed a fixed value):

| Test | Result | Class | Why |
|---|---|---|---|
| `existing-passenger-impact.contract.test.ts` | fails to resolve | **B** | `evaluateExistingPassengerImpact`/thresholds module genuinely don't exist (M-083/084) |
| `live-corridor.contract.test.ts` | fails to resolve | **B** | `classifyRouteDeviation`/`updateLiveCorridor` genuinely don't exist (M-090) |
| `auto-start-inference.contract.test.ts` | fails to resolve | **B** | `evaluateAutoStart` genuinely doesn't exist (M-099/100) |
| `boarding-inference.contract.test.ts` | fails to resolve | **B** | `evaluateBoarding` genuinely doesn't exist (M-096/097) |
| `eta-confidence.contract.test.ts` | fails to resolve | **B** | `classifyEtaConfidence` genuinely doesn't exist (M-007) |
| `cancellation-guard.contract.test.ts` | fails to resolve | **B** | `canCancelTrip` genuinely doesn't exist; real live bug confirmed in `cancelRide` (M-101/INV-04) |
| `no-show-corroboration.contract.test.ts` (5 cases) | resolves, fails at runtime | **B** | `evaluateNoShowReport` genuinely doesn't exist yet (M-102) — distinct RED signature (module found, export undefined) from the other 6, both correctly Category B |
| `segment-capacity.*` (both files, incl. this pass's 2 new cases) | pass | **A** | already-correct, now more precisely proven (exact occupancy, not just `<=`) |
| `cancellation-policy.*` (both files, incl. this pass's hygiene fix) | pass | **A** | already-correct; this pass only made the test track the named constant instead of a re-frozen literal — no behavior change |
| `compute-suggested-price.*` (both files) | pass | **A** | formula already segment-correct; the real M-070 gap is the *wiring* in `bookings.service.ts`, a **B** at the Layer-B/V-02/V-03 level, not here |
| V-01 full-route, V-04 sequential-turnover, V-08 no-show (×2), V-10 capacity-race | pass (carried forward, §11.4) | **A** | already-correct at the full HTTP-stack level |
| V-02/V-03 segment pricing | fail (carried forward) | **B** | confirmed live: `contributionTotal` equals the full-route price unconditionally |
| V-05 active-trip discovery | fail (carried forward) | **B** | confirmed live: `searchRides` excludes `in_progress` unconditionally |
| V-06 three alternatives | fail (carried forward) | **B** | confirmed live: no cross-ride "same journey" grouping/cap/sibling-cancel exists |
| V-07 cancellation (×2) | fail (carried forward) | **B** (both) | confirmed live: no reason required server-side; ride-cancel doesn't cascade to bookings |
| V-09 pre-boarding privacy | fail (carried forward) | **B** | confirmed live: raw GPS returned pre-boarding |
| — | — | **C** | none found this pass — no test was determined to contradict the spec itself |
| — | — | **D** | none found as a still-standing failure this pass — the one D-shaped issue found (cancellation-policy's magic literals) was a passing regression-lock test with a hygiene defect, not a failing test; fixed directly rather than left to classify as a failure |

No test in the current suite is classified **C**: every RED test's expected
behavior was independently checked against the cited spec section in this pass
and found to be a faithful, minimal-interpretation encoding of it (not a
liberty taken with the spec). No currently-*failing* test is classified **D**
either — the only D-shaped problem this pass located (bare 24h/30min/15min
literals) was in an already-*passing* test, and is fixed rather than reported
as an open failure.

### 11.6 Genuine ambiguity that cannot be resolved from the spec

None new beyond the existing ambiguity log (A-1..A-6, `docs/tdd_journey_test_matrix.md`).
One question considered and resolved (not left ambiguous): whether vertical
journeys should use the mission brief's literal "Madrid → Zaragoza → Lleida →
Barcelona" corridor or VAYA's real Tunisia market geography. Resolution: both
already coexist deliberately and correctly — `tests/fixtures`'s canonical
corridor (Layer A, pure math, matches the brief's example exactly) and the real
Tunis/Hammamet/Sousse/Monastir corridor (Layer B/V-, matching this codebase's
own pre-existing integration-test convention and VAYA's actual market) — this
was a considered architectural decision by the increment-3 session (§7 above),
not an oversight, and this pass concurs it should stay that way rather than
forcing one geography everywhere.

### 11.7 Configurable policy values currently hardcoded in implementation

Per M-085a (§11.1) — code-verified this pass, not inferred:

- **Not yet injectable at all**: `CANCELLATION_FREE_WINDOW_HOURS`,
  `CANCELLATION_MODERATE_WINDOW_MINUTES`, `NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE`
  (`packages/domain/src/booking/cancellation-policy.ts`) — exported and named
  (not silently buried), but `computeCancellationPolicy`/`canReportNoShow` accept
  no override parameter, unlike the pattern established elsewhere.
- **Already injectable, the pattern to follow**: `evaluateExistingPassengerImpact(passengers, thresholds)`
  (thresholds always an explicit argument) and `detourAllowanceSec(duration, floorSec?, ceilingSec?)`
  (optional override params, profile-aware defaults) — both in
  `packages/domain/src/matching/`.
- **Not yet built, so not yet assessable**: the live-corridor deviation
  thresholds (`ROUTE_DEVIATION_NOISE_THRESHOLD_METERS`/`..._REAL_THRESHOLD_METERS`)
  and the boarding/auto-start evidence-sufficiency rules are still RED — worth
  designing with the injectable-parameter pattern from the start rather than
  retrofitting it later, per the newly-strengthened spec §28.

### 11.8 Existing architecture/components confirmed correct and to be preserved

- `computeMaxConcurrentSeats`/`wouldExceedCapacity` (`packages/domain/src/booking/segment-capacity.ts`)
  — re-verified exactly correct this pass (§11.1's new exact-occupancy tests),
  including the deliberate end-before-start tie-break at a shared stop.
  `BookingSegment.pickupSequence`/`dropoffSequence`'s use of `-Infinity`/`+Infinity`
  as the free-form/no-stop sentinel is a real, already-shipped, intentional part
  of this module's public type (documented in its own source comment: "so every
  comparison site stays a plain numeric comparison with no special-casing") —
  checked against the mission's "don't make -Infinity/Infinity part of the
  product contract unless architecturally required" warning and found to
  genuinely qualify as required here, not a test artifact to remove.
- `computeCancellationPolicy`/`canReportNoShow` tier logic — behavior confirmed
  still correct; only the regression test's literal-vs-constant hygiene changed.
- `computeSuggestedPrice`'s segment-pricing formula — confirmed still correct
  and already general enough for arbitrary sub-segments; the real gap is
  exclusively the booking-service wiring layer, not this function.
- The matching-thresholds injectable-config pattern (`matching-thresholds.ts`)
  is the right template for every future configurable-threshold module
  (existing-passenger-impact, live-corridor, cancellation-policy) to follow —
  confirmed by direct comparison, not assumed.

### 11.9 Gate verdict after this pass

**Still not fully satisfied — unchanged from increment 3's verdict, and correctly
so.** This pass strengthened the contract's honesty (spec now explicit about
policy ownership/configurability; two tests now assert what they actually mean
instead of a coincidental literal) but did not close any of the substantive
gaps in §5/§9/§11.3 — those remain for the concurrent Layer-B-extension session
and, after that, for implementation itself. Per the mission's explicit
instruction, **no production code was modified in this pass.**

## 12. Implementation pass (Increment 6) — M-004/M-020/M-039/M-014/M-015/M-017/M-040/EDGE-053 built, real gaps in prior "done" claims closed

Unlike increments 3–5 (test-only, per each one's own explicit instruction),
this pass's mandate was to *implement* against the gate this suite already
established — continuing from an in-progress prior session that had already
landed M-054/M-051–058/M-085/M-091/Layer-A-inference-wiring/the admin config
UI (`apps/admin/src/pages/OperationalConfigPage.tsx`) in earlier commits on
this same branch. This section covers what changed from there.

### 12.1 Requirements newly implemented and verified this pass

- **M-004/M-020** (§5/§13 — "a selected stop is not a fixed pickup
  coordinate"): `bookings.service.ts`'s new `resolveStopWalkMeters`
  independently re-derives the real walk distance from the passenger's own
  `requestedPickup`/`requestedDropoff` to the chosen stop, rejecting an
  implausible selection (400) instead of trusting `pickupStopId` verbatim.
  The real distance is persisted (`bookings.pickupWalkMeters`/
  `dropoffWalkMeters`, migration `0024`, additive). Also fixed, found along
  the way: `dropoffStopId`/`dropoffLabel`/`dropoffLat`/`dropoffLng` existed
  on the DB row and were computed by `createBooking` since Phase 13, but
  `bookingResponseSchema` never listed them — Fastify's response serializer
  silently stripped them from every booking response.
- **M-039** (§13 — genuine joint pickup/dropoff optimization): new
  `packages/domain/src/matching/joint-stop-score.ts`
  (`computeJointStopScore`/`rankStopsByJointOptimum`) combines the
  passenger walk-distance signal with the driver-side
  `suitabilityScore`/`deviationMeters` `stop-candidates.service.ts` already
  computes at generation time but `matching.service.ts` previously
  discarded entirely — the "two disconnected single-objective passes" gap
  this exact report's earlier increments documented. Wired into every
  candidate-building path as `MatchCandidate.recommendedStopId`/
  `recommendedDropoffStopId`, additive to the existing walk-distance
  ranking.
- **M-014/M-015/M-017** (§4.1 — pedestrian-zone rejection, no-stopping
  feasibility, and "no bypass for a manually-placed point"): new
  `isPedestrianOnlyLocation` (a conservative OSM-tag allowlist, real for
  Nominatim, honestly null for Google) and `exceedsStopAccessDistance`
  (real evidence from OSRM's own `nearestRoad` snap distance). Both wired
  into `scoreStopCandidate` as new hard-reject reasons, and into
  `addCustomStop` — which, before this pass, had a confirmed real gap: its
  `pickup`/`dropoff` role branch performed **zero** road-snapping or
  validation at all, unlike the `via` branch. All three roles now share
  one code path for this.
- **M-040/EDGE-053** (§14, edge 53 — passenger override with real
  recalculation, never blocked when feasible): new `previewPickupOverride`
  + `GET /rides/:rideId/pickup-override-preview`, built on a refactored
  `computeDetourImpact` shared by the pre-existing
  `assertRealDetourWithinAllowance` (unchanged behavior) — a real,
  side-effect-free preview shown before commit, mirroring the existing
  `cancellation-preview` pattern. Wired into mobile: `search/pickup-point.tsx`
  gained a real long-press-to-place-a-point affordance (`MapCanvas` gained
  an additive `onLongPress` prop for this), calling the preview live and
  showing the real consequence before the passenger confirms.

### 12.2 Real gaps found in the *prior* session's "done" claims, and closed

Not scope creep — each of these is inside the areas this pass was already
touching, found by checking whether a claimed-complete backend capability
actually had a real caller, per this report's own established discipline
(§10.2's "verified live, not assumed" precedent):

- **M-054's mobile side was never actually built**, despite the matrix
  showing PASS after the API field landed: `bookings/confirmed.tsx` ran its
  own fixed 7-minute client-only countdown, with its own doc comment
  admitting "no backend expiry policy exists yet... this is a UI cue, not a
  real deadline" — a real fabricated-data instance the API-side fix never
  touched. Fixed: shows the real `booking.expiresAt`, with no countdown
  number at all until it has actually loaded. The driver-facing
  `RequestDetailSheet` and the ride-hub's `PendingRequestRow` (M-059/M-061)
  had no deadline display at all, confirmed by grep before the fix, not
  assumed — both now show it.
- **M-004/M-020's server-side mechanism had no real caller**: the backend
  logic (built earlier this pass) only activates when the client sends
  `requestedPickup`/`requestedDropoff`, but the one real mobile call site
  (`search/ride-details.tsx`) never sent them — confirmed by reading the
  actual `createBooking` payload before wiring it, not assumed. Fixed in
  the same pass that built the backend, not left as a second gap.

### 12.3 Vertical journeys: this session's environment cannot re-execute them

**Superseded later in this same pass — see §13.** Real Google Maps Platform
keys were located and configured mid-pass, resolving the blocker described
below. Left in place as an accurate record of the state at the time this
section was written, not deleted.

`docs/tdd_journey_test_matrix.md`'s V-01..V-10 table reflects an **earlier**
session's real execution (5 passed / 7 failed against live infrastructure).
This session's sandbox cannot reproduce that run: `docker logs vaya-osrm`
shows `Required files are missing, cannot continue` — the Tunisia OSRM
extract was never prepared in this environment at all (not merely
unreachable) — and no `GOOGLE_ROUTES_API_KEY` is configured either. Every
journey that books a free-form dropoff (nearly all 10) fails at
`assertRealDetourWithinAllowance`'s pre-existing "no route to validate a
detour against" guard, because `POST /rides` stores `routePolyline: null`
whenever both routing providers are unavailable
(`route.polyline || null` — `apps/api/src/modules/rides/rides.service.ts`).
Verified this is a pure infrastructure gap, not a regression from this
pass's changes: the guard itself is untouched (only refactored into a
shared, behavior-identical helper, `computeDetourImpact`); `apps/api`'s
full non-journey-e2e test suite (real Postgres/Redis, `pnpm --filter
@vaya/api test`) passes 328/333, with the 5 failures independently
confirmed as pre-existing (3 need real Google OAuth credentials, 2 need
the same missing OSRM extract). **Concrete blocker, not a deferral**:
re-running the vertical-journey suite for real needs either a prepared
Tunisia OSRM extract (`docker/docker-compose.yml`'s `osrm` service,
multi-GB download + preprocessing — genuinely infeasible to set up
within this session) or a real `GOOGLE_ROUTES_API_KEY`, neither available
here.

### 12.4 Full verification sweep, this pass (all real, all executed)

| Package | Result |
|---|---|
| `@vaya/domain` typecheck + test | clean; 202/202 |
| `@vaya/validation` typecheck + test | clean; 6/6 |
| `@vaya/design-system` typecheck + test | clean; 120/120 |
| `@vaya/api` typecheck + test | clean; 328/333 (5 pre-existing/environmental, §12.3) |
| `@vaya/mobile` typecheck + test | clean; 250/255 (5 pre-existing, `profile-screen.snapshot.test.tsx` — unrelated to any file this pass touched, confirmed by `git status` showing zero profile-related files in this pass's diff) |
| `@vaya/mobile` lint | 1 pre-existing error + 8 pre-existing warnings, zero new (none in any file this pass touched) |
| `tests/e2e` vertical journeys | blocked by environment, §12.3 |

New test files this pass: `bookings-pickup-resolution.integration.test.ts`
(3/3), `bookings-pickup-override-preview.integration.test.ts` (5/5),
`joint-stop-score.test.ts` (7/7), plus new cases inside
`stop-candidates.service.test.ts` (8 new) and
`stop-candidates.integration.test.ts` (2 new, M-015/M-017 — both real,
executed against live Postgres + best-effort-live OSRM/Nominatim).

### 12.6 Matrix reconciliation: ~30 rows corrected from stale FAIL to verified PASS

While implementing this pass's own scope, checking whether M-091/M-051–058
were "already done on entry" (per the prior session's own todo-list framing)
surfaced something bigger: this matrix's header timestamp
(`main@8b61f21/2019ed7`) predates **four entire prior-session commits** on
this branch — `dd486d1` ("journey-contract gate — Layer A domain gaps + 4
API slices"), `18db93b` (deadlines/grouping/admin-config), `1a8ee82`
(Layer-A inference wiring), `89950c5` (M-091) — none of which were ever
reflected in the matrix's row-by-row verdicts. Left as-is, a future session
reading this matrix would have re-implemented substantial, already-shipped
work.

Each correction below was verified against a real, currently-passing
executed test this pass actually ran — never inferred from a commit message
alone:

- **M-051/052/055/056/058, EDGE-049, INV-03** (cross-ride same-journey
  request grouping/capping/superseding) — `bookings-journey-grouping.
  integration.test.ts`, 3/3.
- **M-090, M-096/097, M-099/100, EDGE-051, INV-08** (trip-lifecycle
  auto-inference: route-deviation classification, boarding, auto-start) —
  `trip-auto-inference.integration.test.ts`, 5/5.
- **M-091, EDGE-050** (in-progress-ride live-position matching) —
  `matching-in-progress.integration.test.ts`, 3/3.
- **M-070, M-074, EDGE-055** (segment-aware pricing; M-072/M-073 marked
  PASS-by-mechanism rather than independently tested — no dedicated test
  names them) — `bookings-segment-pricing.integration.test.ts`, 4/4.
- **M-094, INV-06** (pre-boarding GPS privacy, both the poll AND the
  previously-separately-broken WebSocket push path) —
  `trips-tracking.integration.test.ts` + `realtime-gps-redaction.test.ts`,
  4/4.
- **M-101, INV-04** (ride-level cancellation guard after trip start),
  **EDGE-046, M-111** (ride-cancel cascade) —
  `rides-cancel-cascade.integration.test.ts`, 2/2.
- **M-110** (cancellation reason required from a fixed set) —
  `bookings-cancellation.integration.test.ts`'s dedicated case.
- **M-007** (ETA confidence classification) — `classifyEtaConfidence` now
  surfaced on `getTrackingState`, confirmed present in code.
- **M-102** — confirmed a real location-corroboration path with a real
  mobile caller (`NoShowReportSheet`'s `useCurrentPosition`), not merely a
  domain function.
- **V-02, V-03** — the prior implementing session (`dd486d1`) independently
  re-confirmed these live against a real server; **V-05, V-06, V-07, V-09**
  had their underlying gaps closed by the fixes above but could not be
  re-run as live HTTP journeys in any session since (this session included)
  due to the OSRM/Google-key gap in §12.3 — marked as such, not silently
  claimed PASS.

**Checked and deliberately left unchanged**, confirmed still genuinely open
rather than assumed stale: **M-081–084, M-085, EDGE-052, INV-09** —
`evaluateExistingPassengerImpact` (a real, tested pure function since
`dd486d1`) has zero real callers anywhere in `apps/api` (confirmed by grep
this pass), and `getMatchingThresholds`/`MAX_DETOUR_RATIO` remain
hardcoded, unlike the cancellation/no-show/deadline/grouping thresholds
`18db93b` did make admin-injectable. **M-092** downgraded from blanket FAIL
to PARTIAL — the position/detour/ETA fields are real, but no dedicated
shape-completeness test exists and the existing-passenger-impact field
specifically is not wired in.

### 12.5 Gate verdict after this pass

**Every item this pass's task explicitly named as non-deferrable is closed**:
M-091, M-051–058, admin configuration UI were already done on entry (found
verified, not re-built — see §12.6 for how large that "already done" set
actually turned out to be, and how out of date this matrix was about it);
stop corridor-intent/joint-optimization (M-004/M-020/M-039) and
pedestrian-zone/no-stopping-feasibility rejection (M-014/M-015, plus the
adjacent M-017 bypass gap) are newly implemented and tested this pass;
M-040/EDGE-053 (the third item from the prior session's own in-progress
todo list) is implemented, tested, and wired into mobile. The one honestly
blocked item is re-executing the vertical-journey suite live, for the
infrastructure reason in §12.3 — not a scope decision, and not something
any amount of further code-writing in this session can resolve. A real,
substantial body of work (§12.1) genuinely remains outside this pass's
scope and this matrix's own explicit task list — M-081–085/EDGE-052/INV-09
(existing-passenger impact, matching-threshold admin-injectability),
M-113 (4/12 notification event types structurally absent), and the finer
no-show/boarding-ambiguity edge cases — carried forward honestly, not
claimed done.

## 13. Real Google Maps Platform keys configured mid-pass — the §12.3 blocker resolved, two more real bugs found

After §12's own verdict was written, the user pointed out that real
`GOOGLE_MAPS_SERVER_API_KEY`/`GOOGLE_ROUTES_API_KEY`/`GOOGLE_PLACES_API_KEY`/
`GOOGLE_GEOCODING_API_KEY` values already existed (found in a sibling
worktree's `.env`, `worktree-gmp-verification`) and could be configured in
this one. This section documents what changed once they were.

### 13.1 The §12.3 blocker is resolved

With real keys in `apps/api/.env` and a real dev server running against
them, the full `tests/e2e/tests/journeys/` suite was re-run against real
Google-routed geometry (this sandbox's raw OSRM container remains
unprepared — `docker logs vaya-osrm` still shows `Required files are
missing` — but `ROUTING_PROVIDER=auto` picks Google whenever a server key
is present, per `lib/routing-providers/index.ts`, so this doesn't matter
for anything routed through the abstracted provider). **All 10 journeys,
12 cases, now pass.** Two of them only passed after fixing real bugs the
haversine-fallback path had been silently masking (§13.2). Individual
journeys not needing a bug fix (V-01, V-02, V-03, V-04, V-06, V-07, V-10)
passed on the very first real-routing run.

### 13.2 Two real, previously-unexercised bugs found and fixed

- **M-091 search-layer gap** (`matching.service.ts`'s
  `scoreInProgressCandidates`): required a real driver-selected
  `route_stop` at BOTH the pickup and dropoff end, mirroring
  `scorePassThroughCandidates`'s pure-passthrough design — correct for
  that tier, wrong here. The spec's own worked example for in-progress
  matching ("Passenger searches Zaragoza -> Barcelona" where Barcelona is
  the driver's own, unchanged final destination) needs no stop at the
  destination at all; it's the ride's own endpoint. `journey-5-active-trip-
  discovery.api.test.ts` failed live on the first real-routing run,
  confirming this wasn't just a theoretical gap. Fixed by adding a direct-
  radius check against the ride's own origin/destination coordinates
  (mirroring `buildEndpointCandidate`'s existing, already-correct pattern
  for the ordinary endpoint tier), falling back to the stop-based
  resolution only when the direct match doesn't apply. Re-run confirms
  `journey-5` now passes, and `matching-in-progress.integration.test.ts`
  (Layer B) is unaffected (3/3 still pass).
- **No-show report validation bug** (`bookings.routes.ts`'s
  `reportNoShowBodySchema`): a genuinely empty POST body (no
  `Content-Length` — the real shape a client sends with no GPS fix) is
  parsed by Fastify's JSON body parser as literal `null`, not `undefined`.
  Zod's `.default({})` only ever substitutes for `undefined`, so this real,
  legitimate request shape was rejected with a 400 ("Expected object,
  received null") before ever reaching `reportNoShow` — undetected until
  now because `journey-8-no-show.api.test.ts` previously never got past an
  earlier OSRM-dependent step in its own setup. Fixed with
  `z.preprocess((val) => val ?? {}, ...)`, which normalizes both `null` and
  `undefined` before validation. Re-run confirms `journey-8` now passes,
  both cases.
- **Segment-pricing test fixture bug** (found while investigating a THIRD
  apparent regression in the wider `apps/api` suite, not itself an e2e
  journey): `bookings-segment-pricing.integration.test.ts`'s M-070 case
  hardcoded a "full route price" of 25 DT with no relationship to the real
  ~140km Tunis-Sousse route the test actually exercises. With real
  Google-routed distances, a correctly-computed real sub-segment price
  (28.5 DT) legitimately exceeded that arbitrary number — the fixture was
  wrong, not `computeBookingContributionTotal`. Fixed by deriving the
  reference price from the same real formula
  (`computeSuggestedPrice(distanceKm, durationMin, DEFAULT_PRICING_CONFIG)`)
  the production code itself uses, the same "one source of truth"
  discipline this codebase's own `seed.ts` already follows for its own
  fixture pricing.

### 13.3 A latent flakiness source found, diagnosed, and deliberately not touched

Re-running the full `apps/api` suite against real routing (before the DB
reset in §13.4) surfaced a fourth apparent failure: the `detour_match` tier
integration test (`matching-tiers.integration.test.ts`) couldn't find its
own fixture ride among the results. Root-caused precisely, not guessed, via
targeted temporary diagnostics (added, verified, then reverted — never left
in the committed code): the fixture ride's `route_geom` was genuinely
populated and genuinely within the real `ST_DWithin` corridor — the ride
simply lost out to 15 *other* rides in a `LIMIT 15` query
(`findCandidateRideIdsByCorridor`, `apps/api/src/lib/spatial.ts`) that has
**no `ORDER BY` clause at all**, so which 15 of a 128-row (at the time)
candidate pool Postgres happens to return is arbitrary. This session's own
many repeated test/journey runs had accumulated those 128 stale `rides`
rows in the shared local dev Postgres with no cleanup between runs.

This is flagged, not fixed: it's a real, if minor, latent
determinism/relevance gap in a tier from a different initiative (Google
Maps Platform / PostGIS) outside this pass's own scope — a future pass
should give `findCandidateRideIdsByCorridor` (and its sibling stage-1
queries) a real `ORDER BY` (e.g., proximity or departure-time proximity)
rather than relying on incidental physical row order, which is exactly
the kind of thing that reads as "flaky" in CI without ever being a
functional defect in the underlying matching logic. The *immediate*
symptom was resolved by addressing its actual cause instead (§13.4).

### 13.4 Local dev Postgres reset (user-approved, since this is a destructive action)

Confirmed the 128-row accumulation via `docker exec vaya-postgres psql ...
SELECT count(*) FROM rides` before touching anything. Asked the user
before truncating (a mass `TRUNCATE` was correctly flagged by the harness's
own auto-mode classifier as needing explicit approval) — approved. Ran:

```
TRUNCATE TABLE admin_users, analytics_events, audit_logs, bookings,
  conversations, demand_signals, device_tokens, driver_profiles, messages,
  notifications, oauth_login_tickets, operational_configs, otp_codes,
  pricing_configs, ratings, recurring_detection_configs,
  recurring_patterns, refresh_tokens, relationship_signals, reports,
  rider_profiles, rides, route_stops, routes, trips, users, vehicles,
  verification_documents RESTART IDENTITY CASCADE;
```

(`spatial_ref_sys`, PostGIS's own system table, was correctly left alone.)
Then `pnpm db:seed` — which completed its actual seeding fast (40 users, 30
drivers, 8 routes, 68 rides, "Seed complete." printed) but then hung for
~15 minutes on a separate, non-critical enrichment step
(`generateCandidateStopsForRide`, called per seeded ride after the main
seed logically finishes) that needs the raw OSRM container directly — its
crash-restart loop apparently leaves brief windows where connections hang
rather than failing fast, unlike a cleanly-down service. Killed that stuck
tail once the core seed data was confirmed complete and committed (`Seed
complete.` had already printed, `route_geom` was already backfilled for
all 81 rides created up to that point) — the killed step only skips
optional stop-suggestion generation for some seeded rides, nothing
destructive or partially-written.

### 13.5 Full re-verification against the clean database

- `apps/api` full suite: **329/333** (was 328/333 before this section's
  work, then dropped to 326/333 with real routing exposing the three bugs
  above and the DB-pollution flakiness, then back up once both were fixed
  and the DB was reset). The 4 remaining failures are the same
  pre-existing/environmental ones throughout this whole report: 3 need real
  Google *OAuth* client credentials (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  — distinct from the Maps Platform keys just configured), 1 needs a real
  prepared OSRM Tunisia extract (still absent).
- `tests/e2e` vertical journeys: **12/12**, confirmed twice — once in a
  full-suite batch run (where a 13th, unrelated run of journey-8 hit real
  OTP rate-limit contention from this session's own cumulative testing
  load — a real, expected characteristic of the real 5/minute/IP limit
  under heavy sequential load, not a code issue) and once again for
  journey-8 in isolation (2/2, confirming the batch-run failure was pure
  contention).
- Full workspace `pnpm typecheck`/`pnpm lint`: clean, same pre-existing
  lint findings as the rest of this report (zero new).

### 13.6 Gate verdict, final

Both concrete blockers this report ever named — the vertical-journey suite
needing real infrastructure (§12.3), and the specific M-091 gap (§12.1) —
are now closed, verified live, not merely by code-reading. The remaining
genuinely-open items are exactly the ones §12.5 already named and stand
unchanged: M-081–085/EDGE-052/INV-09, M-113, and the finer no-show/
boarding-ambiguity edge cases — none of them touched by, or requiring,
the routing keys or DB reset in this section.

## 14. Full spec closure pass — every remaining named gap closed (M-081/082, M-083/084/085/M-085a, M-092, M-104, M-113)

On explicit direction ("the ultimate definition of done is everything in
the specifications in unified_driver_and_passenger_journey"), this pass
worked through every item §13 above still listed open, one at a time:
implement → typecheck → real test → full regression → commit.

**M-085/M-085a (spec §28, admin-config injectability)** — `detourAllowanceSec`
gained an explicit `maxRatio` parameter (was a bare `MAX_DETOUR_RATIO`
module reference); `assertRealDetourWithinAllowance`/`computeDetourImpact`
and `scoreDetourCandidates` now resolve it from `getActiveOperationalConfig`.
`matching-thresholds.admin-config-contract.test.ts` was rewritten to prove
real behavioral injectability (two different ratios genuinely producing two
different allowances) rather than an arity check — this caught its own bug
along the way (a too-short baseline duration clamped both the default and
doubled ratio to the same ceiling, masking the very thing the test meant to
prove).

**M-083/M-084/EDGE-052/INV-09 (spec §27/§62, existing-passenger soft
protection)** — `evaluateExistingPassengerImpact` (a real, already-tested
pure domain function) had zero real callers anywhere in `apps/api`, confirmed
by grep before starting. New `assertExistingPassengerImpactAcceptable`
(`bookings.service.ts`), called from `createBooking` only when the request
itself introduces a genuine free-form detour, projects every already-accepted
booking's own pickup/dropoff onto the ride's real route geometry to compute
their remaining trip duration and whether they'd experience any of the new
detour's real extra duration. `assertRealDetourWithinAllowance` was changed
to return the computed `DetourImpact` (was `void`) so this could reuse the
already-decoded route rather than a second routing call. Verified: new
`bookings-existing-passenger-impact.integration.test.ts`, 2/2, real Postgres
+ real routing — one small real detour accepted with a long-remaining-trip
passenger onboard, the *same* detour rejected once an admin tightens the
threshold.

**M-081/M-082 (spec §25/§26, segment-aware search capacity)** — the most
invasive of the remaining items, and the one that surfaced the most real bugs
beyond its own headline fix. Every search tier
(`buildEndpointCandidate`/`scoreCandidates`, `scorePassThroughCandidates`,
`scoreInProgressCandidates`) dropped its flat `ride.seatsAvailable < 1` gate
for a real per-segment `hasSegmentCapacity` check (new
`fetchAcceptedSegmentsByRide`, reusing `packages/domain`'s already-tested
`wouldExceedCapacity`) against the rider's own resolved pickup/dropoff stop
pair — closing the exact "Madrid→Zaragoza full, Zaragoza→Barcelona wide open"
example spec §25 names by name. Writing a real, positive integration test for
this (not just a regression check) surfaced two further real bugs, both
silently reintroducing the identical flat-capacity bug one layer earlier than
the application code: all three PostGIS stage-1 pre-filters in `lib/spatial.ts`
(`findCandidateRideIdsByEndpoints`/`ByCorridor`/`ByBoundingBox`) still had
their own hardcoded `AND seats_available > 0`, and `findCandidateRideIdsByCorridor`
had a `LIMIT` with no `ORDER BY` at all — with more corridor-qualifying rides
in the shared local dev Postgres than the cap, an unordered `LIMIT` silently
drops the rider's own best match, which is exactly what happened on the first
run of the new test (the fixture ride simply never appeared in the candidate
list). Both fixed. A third, unrelated setup bug in the test itself
(forgetting `upsertRouteGeometry` on a directly-inserted ride fixture, so
`route_geom` stayed `NULL`) was also found and fixed before the test could
pass for the right reason. M-082 (turnover) closes as a natural, already-true
consequence of M-081: `searchRides` is pull-based and stateless, re-deriving
segment occupancy fresh from `bookings` on every call — there is no
eligibility cache to invalidate when a segment frees up. Verified: new
`matching-segment-capacity.integration.test.ts`, 2/2, real Postgres + real
routing; full matching+bookings regression, 18 files/98/98, no regressions.

**M-092 (spec §30, in-progress match shape completeness)** — re-examined
rather than left open. `scoreInProgressCandidates`'s own two pickup/dropoff
resolution branches (a real driver-selected `route_stops` entry ahead of the
driver, or the ride's own unchanged origin/destination) mean every candidate
this tier returns is bookable through `createBooking`'s stop-resolved path,
never a genuine free-form insertion — the exact precondition M-083/084's
existing-passenger check gates on is structurally false for this tier by
construction. A preview field here would be tautologically "no impact" for
every result; concluded this was never a real gap for this specific tier, not
silently closed.

**M-104 (spec §37, automatic no-show classification)** — "VAYA may also
automatically classify one when evidence is sufficiently strong" had no
implementation at all. New pure `evaluateAutoNoShowClassification`
(`packages/domain/src/trip/no-show-inference.ts`), mirroring
`evaluateBoarding`/`evaluateAutoStart`'s signals-in/decision-out contract.
Since only the driver ever broadcasts live location in this codebase, both
branches are built from the driver's side only: a passenger no-show from the
driver having genuinely waited, confirmed-arrived, at pickup past a threshold
with no boarding; a driver no-show from departure passing a grace period
while the driver's phone was demonstrably still broadcasting (ruling out
"phone off") yet never once came near the ride's origin (new nullable
`trips.driverEverNearOriginAt`, migration `0025`). Wired into the existing
trip-staleness-sweep BullMQ job, reused rather than a new mechanism.
`bookings.service.ts`'s `reportNoShow` had its post-decision core extracted
into `finalizeNoShowOutcome`, now shared by both the human-report path and
the new `applyAutoNoShowClassification` — the automatic path reuses the exact
real status-transition/seat-release/rating/notification mechanism a human
report goes through. Verified: 7/7 `no-show-inference.contract.test.ts`
(domain); 3/3 new `trip-auto-no-show.integration.test.ts` (real Postgres)
covering both no-show directions plus the conservative "silence is not
evidence" case.

**M-113 (spec §39, notification event coverage)** — 4 of the spec's 12 named
lifecycle events had no event TYPE at all in `notificationEventTypeEnum`,
confirmed structurally absent (not just undispatched) by the existing
`notification-event-coverage.contract.test.ts`. Added
`booking_deadline_approaching`, `booking_sibling_cancelled`, `trip_active`,
`trip_eta_changed` (migration `0026`), each with real title/body copy and a
real dispatch site: `runBookingExpirySweep` extended with a driver reminder
inside a new pure `isDeadlineApproaching`'s lead window; `acceptBooking`'s
sibling-supersede notification switched from a conflated `booking_declined`
to the real distinct type; `confirmPassengerAboard` and its GPS-inferred
counterpart both dispatch `trip_active` to the driver; `updateTripLocation`'s
throttled ETA recompute dispatches `trip_eta_changed` only when a fresh ETA
drifts past a real threshold from the last one the rider was actually told
about (never on every routine ~20s recompute, preserving M-114's no-spam
invariant). Verified: `notification-event-coverage.contract.test.ts` updated,
14/14; new `notification-m113-new-events.integration.test.ts`, 4/4, real
Postgres + real routing, including a genuine ETA computation for the
ETA-change case.

**Net result**: every item this report, the matrix, and CLAUDE.md's own
tracking ever named as a remaining gap in the journey-contract initiative is
now closed and verified with a real, executed test — not a documentation-only
correction, except M-092 (a documentation correction after genuinely
re-examining whether a gap existed at all). Full regression after all of the
above: domain 213/213, api 341/345 (the 4 failures are the same
pre-existing, unrelated ones §13 already documented — 3 need real Google
OAuth credentials this sandbox doesn't have, 1 needs a prepared Tunisia OSRM
graph this sandbox doesn't have; neither touched by this pass). typecheck/
lint clean across both packages.
