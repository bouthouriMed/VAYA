# VAYA — Continue TDD Contract, Then Implement

You are continuing an existing VAYA Claude Code session/workflow.

The previous session was executing the VAYA TDD-first mission based on:

`docs/unified_driver_and_passenger_journey.md`

The previous session may have been interrupted by the Claude API/session spend limit. **Do not assume the previous work is complete. Recover the actual state from the repository first.**

## 1. FIRST: RECOVER STATE

Before doing anything else:

* Inspect git status.
* Inspect recent git diff/history.
* Inspect all test files and test infrastructure created so far.
* Inspect:

  * `docs/tdd_journey_test_matrix.md`
  * `docs/tdd_journey_test_report.md`
  * any test fixtures/utilities created
* Inspect the task/workflow state if present.
* Determine exactly which parts of the TDD mission are complete, partially complete, or missing.

Do not redo completed work unnecessarily.

Do not assume an earlier agent's claimed progress is correct. Verify the repository.

---

# 2. THE TDD GATE

The product specification remains:

`docs/unified_driver_and_passenger_journey.md`

The specification is the product authority.

The tests are the executable behavioral authority.

The existing implementation is NOT the authority.

Before modifying production code, verify that the following TDD gate is satisfied:

### Required

* Full specification has been read.
* Every meaningful requirement has a test mapping.
* Important edge cases have tests.
* Deterministic fixtures exist.
* Deterministic time exists.
* External routing/GPS/push dependencies are controlled.
* Layer A tests exist where appropriate.
* Layer B API/integration tests exist where appropriate.
* Layer C user-journey E2E tests exist where appropriate.
* Required vertical journeys exist.
* Required regression tests exist.
* Tests have been executed.
* Failures have been classified.
* `docs/tdd_journey_test_matrix.md` is complete.
* `docs/tdd_journey_test_report.md` is complete enough to identify implementation gaps and ambiguities.

Do NOT start production implementation merely because some tests exist.

If the gate is incomplete, **finish the test contract first**.

---

# 3. CONTINUE THE TEST PHASE

Use the original VAYA TDD mission as the detailed specification.

In particular, ensure coverage of:

* search and matching
* active-trip matching
* route geometry
* corridor intent
* pickup/dropoff optimization
* passenger pickup overrides
* ranking
* passenger-specific ETA
* pricing
* segment capacity
* passenger turnover
* existing-passenger impact
* request grouping
* three-request maximum
* deadlines
* concurrent acceptance
* cancellation
* no-show
* lifecycle/state transitions
* automatic trip start
* internal tracking
* passenger tracking privacy
* boarding inference
* route deviation
* automatic completion
* reviews
* notifications
* deterministic time
* GPS uncertainty
* search fallbacks
* admin/configuration boundaries

Also ensure the required canonical journeys are represented.

Do not weaken tests because the current implementation fails.

Do not invent product behavior.

If the specification is genuinely ambiguous, document the ambiguity instead of silently deciding.

---

# 4. RUN AND CLASSIFY

Once the test contract is sufficiently complete:

Run the relevant test suites.

Classify failures as:

### A — Existing behavior already correct

The test passes or exposes no implementation gap.

### B — Missing required behavior

The implementation needs to be built.

### C — Existing implementation contradicts the specification

The production implementation needs correction.

### D — Specification/test ambiguity

Do not guess.

Document it.

### E — Test infrastructure problem

Fix the test infrastructure rather than weakening the behavioral test.

Update:

`docs/tdd_journey_test_report.md`

with the actual results.

---

# 5. ONLY THEN ENTER IMPLEMENTATION

Once the TDD gate is satisfied, begin implementation.

The tests are now the executable contract.

Do NOT rewrite tests merely to make implementation pass.

Implement the behavior required by the specification and demonstrated by the tests.

Preserve existing behavior that is already correct.

---

# 6. IMPLEMENTATION ORDER

Implement vertically in this order unless the actual dependency graph requires a different sequence:

1. Data integrity and domain model
2. Core matching/search
3. Segment-aware capacity
4. Pricing
5. Booking/request grouping/concurrency
6. Deadlines and expiration
7. Cancellation/no-show
8. Trip lifecycle
9. Active-trip matching
10. Tracking and GPS uncertainty
11. Boarding inference
12. Route deviation/recovery
13. Notifications
14. Passenger/driver journey APIs
15. Mobile UX integration
16. Polish

Do not build superficial UI around broken domain behavior.

---

# 7. IMPORTANT ARCHITECTURAL RULES

Preserve these principles from the specification and previous architectural decisions:

* Match the passenger's requested journey against the driver's feasible remaining journey.
* Active trips must remain discoverable when a feasible remaining corridor exists.
* Do not create a separate independent matching engine for active trips.
* Driver corridor intent is not automatically a hard passenger endpoint.
* Pickup and dropoff should be jointly evaluated from passenger and driver perspectives.
* Driver detour and existing-passenger impact are separate concepts.
* Capacity is segment-specific.
* Passenger journey grouping represents alternative requests for the same journey, not multi-driver transportation.
* Maximum three alternative requests.
* First valid acceptance wins atomically.
* Sibling active requests must be cancelled atomically after acceptance.
* Deadlines are server-authoritative.
* Do not use client `Date.now() + ...` as authoritative deadline state.
* Do not expose unrestricted raw driver GPS to passengers before boarding.
* GPS uncertainty must not become fabricated certainty.
* Telemetry is not the same thing as a persistent route version.
* Do not create a persistent route version for every GPS update.
* Trip completion must not depend forever on a user pressing a button.
* Preserve existing correct segment-capacity behavior and other verified regressions.

---

# 8. IMPLEMENTATION SAFETY

Before changing production architecture:

Ask:

> What failing behavioral test requires this change?

Prefer the smallest production change that satisfies the contract.

Do not perform unrelated refactors.

Do not replace functioning infrastructure without evidence that the specification requires it.

Do not introduce speculative features.

Do not add arbitrary product rules.

---

# 9. CONTINUOUS VALIDATION

After each meaningful implementation slice:

1. Run the focused tests.
2. Run relevant regression tests.
3. Fix production behavior if the test exposes a real implementation gap.
4. Do not weaken the test.
5. Periodically run the complete suite.

At the end, run the complete relevant test suite.

---

# 10. FINAL STATE

Do not stop merely because compilation succeeds.

The goal is:

SPECIFICATION
→ COMPLETE EXECUTABLE CONTRACT
→ IMPLEMENTATION
→ ALL REQUIRED TESTS PASS
→ VERTICAL JOURNEYS VERIFIED

At the end report:

* what was already completed before this session
* what tests were added
* what production behavior was implemented
* remaining failing tests
* remaining specification ambiguities
* architectural decisions made
* any work still required

Keep `docs/tdd_journey_test_matrix.md` and `docs/tdd_journey_test_report.md` synchronized with reality.

Do not claim completion without running the relevant tests.
