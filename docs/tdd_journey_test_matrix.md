# VAYA Journey Contract — Requirement Extraction Matrix

**Status:** temporary working document for the TDD-first phase. Source of truth for *what VAYA must do* remains `docs/unified_driver_and_passenger_journey.md` ("the spec"). This matrix decomposes it into individually testable requirements and maps each to the executable test(s) that encode it, plus the requirement's *current* status as of `main`@`8b61f21`/`2019ed7`, per `docs/product/unified-journey-audit-2026-08-28.md` (\"the audit\").

**Current result** legend: `PASS` = behavior already correct, test expected green. `FAIL (missing)` = capability doesn't exist. `FAIL (incorrect)` = capability exists but contradicts spec. `FAIL (partial)` = foundation exists, behavior diverges. Where the audit didn't cover a requirement directly, current result is inferred and marked `(inferred)`.

Test ID scheme: `<layer>.<area>.<slug>` — `A.` = domain/unit (Layer A), `B.` = API/integration (Layer B), `C.` = mobile E2E (Layer C), `V.` = vertical journey (spans layers). Layer A tests live under `packages/domain/src/**/__tests__/*.contract.test.ts`. **Vertical journeys (V-01..V-10) live under `tests/e2e/tests/journeys/*.api.test.ts`** — real Playwright HTTP calls against a live server + real Postgres/Redis, following the pre-existing `search-to-booking.api.test.ts` convention, NOT the originally-planned `tests/contract/*.integration.test.ts` location: this reuses `tests/e2e`'s already-working Playwright harness immediately, and — per explicit direction this session — a vertical journey must verify the actual USER EXPERIENCE (real HTTP requests exactly as the mobile app's RTK Query client makes them) rather than calling internal service functions directly. Shared helpers live in `tests/e2e/tests/support/journey-helpers.ts`.

---

## Section 1–2: Core model & product principles

| ID | Spec ref | Behavioral requirement | Test(s) | Current result |
|---|---|---|---|---|
| M-001 | §1, P1 | Search is not a bare filter — must find best solution to passenger's requested journey, expanding intelligently when no exact match exists | `B.search.cascade-fallback`, `V.journey-2-mid-route` | PASS (cascade exists) |
| M-002 | §1, P3 | Passenger route may partially overlap driver route; system calculates feasibility, not exact-equality | `B.search.partial-overlap-zaragoza-barcelona` | PASS |
| M-003 | P2 | Driver publishing Madrid→Barcelona automatically yields derived segments (Madrid→Zaragoza, Zaragoza→Barcelona, etc.) without manual publication | `B.search.derived-segments-not-manually-published` | PASS |
| M-004 | P4 | Passenger's requested coordinates are not automatically the physical meeting point — VAYA determines practical pickup/dropoff | `A.stops.corridor-intent-not-fixed-coordinate`, `B.booking.pickup-resolved-not-passthrough` | FAIL (incorrect) — stop coordinate used verbatim as booking pickup |
| M-005 | P5 | Driver and passenger detail views expose different, role-appropriate framings of the same match (driver: impact-on-my-trip; passenger: can-this-get-me-there) | `B.request-detail.driver-view-shape`, `B.search-result.passenger-view-shape` | PASS (partial — see M-0xx deadline gaps) |
| M-006 | P6 | Lifecycle buttons (Start trip / Passenger onboard / Finish / Report no-show) are confirmations, not sole state source; VAYA infers automatically where reliable signals exist | `A.trip-lifecycle.auto-start-without-button`, `A.trip-lifecycle.auto-board-without-button`, `A.trip-lifecycle.auto-complete-without-button` | FAIL (partial) — completion auto; start/board are not |
| M-007 | P7 | ETAs carry confidence classification (estimated/confirmed/inferred/unavailable); never claim onboard from momentary GPS proximity | `A.gps.no-fabricated-certainty`, `A.boarding.momentary-proximity-insufficient` | FAIL (missing) — no confidence classification surfaced |
| M-008 | P8 | Map communicates planned route, passenger route, overlap, pickup, dropoff, detour, live progress; viewport intelligently fitted | `C.trip-detail.map-elements-present` (Layer C, presentational — behavioral proxy only) | (inferred) PARTIAL |

## Section 3–6: Driver publishing (origin/destination/route/pickup/stops/publish)

| ID | Spec ref | Behavioral requirement | Test(s) | Current result |
|---|---|---|---|---|
| M-010 | §3.1 | Driver can search origin/destination by city, street, landmark, arbitrary place — not city-constrained | `C.publish.origin-search-arbitrary-place` | PASS (Google Places integration) |
| M-011 | §4 | Route alternatives are computed, distinguishable, and one is selected before pickup config | `B.publish.route-alternatives-computed`, `A.route.classify-trip-profile-regression` | PASS (route-options.service) |
| M-012 | §4 | Selected route is the one used by all subsequent matching/ETA (not silently re-derived) | `B.publish.selected-route-token-redeemed-verbatim` | PASS (routeToken mechanism) |
| M-013 | §4.1 | Recommended pickup points near origin must not be on a highway | `A.stop-candidates.reject-highway-speed-samples` | PASS (speed-inferred reject) |
| M-014 | §4.1 | Recommended pickup points must not be in pedestrian-only areas | `A.stop-candidates.reject-pedestrian-zone` | FAIL (missing) — no pedestrian-zone signal at all |
| M-015 | §4.1 | Recommended pickup points must not be operationally unsuitable / vehicle cannot stop | `A.stop-candidates.reject-no-stopping-feasibility` | FAIL (missing) — only speed-classification proxy exists |
| M-016 | §4.1 | Driver can select a recommended point OR manually place another point | `B.publish.manual-pickup-point-accepted` | PASS (mechanism exists) |
| M-017 | §4.1 (implicit invariant) | A manually-placed point is still subject to the same feasibility validation as a recommended one — no bypass | `B.publish.manual-point-rejects-highway` | FAIL (incorrect) — `addCustomStop`'s pickup/dropoff branch skips `nearestRoad`/feasibility entirely |
| M-018 | §4.2 | Same accessibility rules apply symmetrically to drop-off | `A.stop-candidates.dropoff-same-rules-as-pickup` | PASS/FAIL mirrors M-013–M-017 |
| M-019 | §5 | Stops recommended are meaningful intermediate cities (Zaragoza, Lleida), not every settlement on the polyline | `A.stop-candidates.intercity-density-recognizes-major-cities` | PASS (trip-profile-aware sampling) |
| M-020 | §5, invariant "Matching" (§62) | Selecting a stop communicates corridor willingness, not a fixed pickup coordinate — VAYA later resolves actual point | `A.stops.corridor-intent-distinct-from-fixed-point`, `B.booking.pickup-resolved-not-passthrough` (=M-004) | FAIL (incorrect) — stored road-snapped coordinate used verbatim |
| M-021 | §5, §54, §62 | A driver-selected stop is NOT required for a feasible match (hard invariant) | `bookings-inv07-stop-not-required.integration.test.ts` (real, executed, PASSES at the booking layer) | **REFINED this increment, was blanket FAIL (incorrect):** `route_passthrough` still hard-requires stops both ends (matching.service.ts ~L634, confirmed) — that half of the finding stands. But `createBooking`'s free-form-pickup branch (bookings.service.ts ~L405-419) places NO stop requirement on a zero-stop ride at all — confirmed live, not just by reading code. So INV-07 genuinely PASSES at the booking layer unconditionally, and PARTIALLY at the search layer (only reachable via the OSRM-dependent `detour_match` fallback tier, itself gated behind every other tier being completely empty — untestable live in this sandbox, no prepared OSRM graph — Category E). Net: **PARTIAL, not a clean FAIL** — see `docs/tdd_journey_test_report.md` for the full reasoning. |
| M-022 | §6 | Published ride contains: origin, destination, route, departureAt, ETA, seats, price/reference price, optional stops, pickup/dropoff info, operational constraints | `B.publish.published-ride-shape-complete` | PASS (shape) |

## Section 7–18: Passenger search, ranking, and result/detail contract

| ID | Spec ref | Behavioral requirement | Test(s) | Current result |
|---|---|---|---|---|
| M-030 | §7 | Search does not require exact origin/destination equality | =M-002 | PASS |
| M-031 | §8 | Passenger sees pickup/ETA for THEIR segment, never the driver's original departure time | `B.search.passenger-specific-pickup-time-not-driver-departure` | PASS |
| M-032 | §9 (hard) | A trip already fully in the past is never returned | `B.search.past-trip-excluded` (=EDGE-past-1) | PASS |
| M-033 | §9 (hard) | A trip currently in progress whose relevant passenger segment has already passed is never returned | `B.search.in-progress-past-segment-excluded` | FAIL (missing) — in_progress excluded wholesale, can't test the nuanced case since ride disappears entirely (see M-034) |
| M-034 | §9, §30, §62 | A trip in progress with a still-feasible remaining segment ahead of the driver IS discoverable | `B.search.in-progress-remaining-corridor-discoverable` (=EDGE-inprogress-1) | FAIL (missing) — zero code path reads live position for matching |
| M-035 | §10, §56 | Never bare "no rides found" if meaningful alternatives exist; expand via time/pickup/dropoff/walk/PT/corridor/other-driver before giving up | `B.search.cascade-exhausts-before-empty` | PASS (4-stage cascade) |
| M-036 | §10 | VAYA must never silently relax constraints — user must understand why an alternative differs | `B.search.tier-message-explains-alternative` | PASS (`TIER_MESSAGES`) |
| M-037 | §11 | Result exposes: origin, destination, pickup time, ETA, pickup walk time, dropoff walk time, pickup loc, dropoff loc, price, route relationship, strong-match flag | `B.search.result-shape-complete` | PASS (mostly) |
| M-038 | §12 | "Best Fit" reflects a real multi-dimensional server computation (time compat, pickup/dropoff convenience, PT burden, driver feasibility, detour, reliability, price) — not pure geographic overlap | `A.matching.best-fit-changes-with-time`, `A.matching.best-fit-changes-with-pickup-distance`, `A.matching.best-fit-changes-with-detour`, `A.matching.best-fit-changes-with-reliability` | PASS (server-computed) but PARTIAL on reliability/price weighting — verify empirically |
| M-039 | §13 | Recommended pickup/dropoff is a genuine JOINT optimum (passenger walk/PT/convenience AND driver detour/road feasibility/continuity) | `A.stops.joint-optimization-not-sequential` | FAIL (incorrect) — two disconnected single-objective passes (generation scores driver-only; ranking scores passenger-only) |
| M-040 | §14, edge 53 | Passenger can override to another VAYA-feasible point; VAYA recalculates walk/PT/detour/ETA/feasibility and informs (not blocks) when worse for driver | `B.booking.passenger-override-pickup-recalculates`, `B.booking.passenger-override-not-blocked-when-feasible` | FAIL (missing) — no override mechanism exists at all beyond choosing among driver's pre-set stops |
| M-041 | §15 | Result detail map distinguishes driver route / passenger route / overlap / pickup / dropoff / detour | `C.trip-detail.map-shows-overlap-and-detour` | (inferred) PARTIAL |
| M-042 | §16 | Itinerary shows requested origin → pickup point → pickup ETA → walk/PT → dropoff → destination ETA, in that order | `B.search-result.itinerary-shape-ordered` | PASS (shape) |
| M-043 | §16, §23 | Maps deep-link opens exact pickup/dropoff point as destination (Google/Apple Maps) | `C.trip-detail.maps-deeplink-uses-real-coords` | PASS |
| M-044 | §17 | Passenger sees THEIR OWN ETA, not the driver's final destination ETA, even when driver continues further | `B.search.passenger-eta-not-driver-final-eta` | PASS |
| M-045 | §18, §62 | Driver-selected stops surfaced to passenger as contextual corridor intent, not implying a fixed physical point | `C.trip-detail.stop-framed-as-corridor-not-fixed` | (inferred) PARTIAL — same UI regardless of "fixed vs. contextual" framing |

## Section 19–23: Passenger request, deadlines, driver inbox/detail, navigation

| ID | Spec ref | Behavioral requirement | Test(s) | Current result |
|---|---|---|---|---|
| M-050 | §19 | Request contains: passenger, requested route, requested time, pickup, dropoff, calculated price, driver impact, expiry/deadline, route/detour data | `B.booking.request-shape-complete` | FAIL (partial) — no expiry field |
| M-051 | §20 | Passenger may hold up to 3 active requests for the SAME journey (not unlimited) | `B.booking.max-three-active-requests-per-journey` (=EDGE-grouping-1) | FAIL (missing) — no cap, no grouping concept |
| M-052 | §20 | A 4th request attempt for the same journey is rejected while 3 are active | `B.booking.fourth-request-rejected` (=EDGE-grouping-2) | FAIL (missing) |
| M-053 | §20 | Duplicate request to the same ride is rejected | `B.booking.duplicate-request-same-ride-rejected` | PASS (existing `(rideId, riderId)` guard) |
| M-054 | §20 | Every request has a server-authoritative response deadline, visible to passenger immediately post-request and to driver inside the incoming request | `bookings-deadline-visibility.contract.integration.test.ts` (real, executed, 2/2 pass — confirms the absence) | FAIL (missing), confirmed live against both the real `createBooking` return value and the real persisted row — no `expiresAt`/`deadline` field exists anywhere; client-only countdown |
| M-055 | §20, §49, §62 | First acceptance wins: accepting Driver A confirms it and auto-cancels/closes all other pending requests for the same journey | `B.booking.first-acceptance-cancels-siblings` (=V.journey-6) | FAIL (missing) — no cross-ride mechanism |
| M-056 | §20 | Passenger cannot end up with multiple simultaneously-confirmed bookings for the same journey | `B.booking.no-double-confirmation-same-journey` | FAIL (missing) — direct consequence of M-055 |
| M-057 | §20 | Driver rejection closes only that request; siblings continue | `B.booking.reject-closes-only-that-request` | PASS |
| M-058 | §20 | Request expiry closes only that request automatically; siblings continue | `B.booking.expiry-closes-only-that-request` | FAIL (missing) — nothing ever sets `expired` at runtime |
| M-059 | §21 | Incoming driver notification/request for an OVERLAPPING (not just exact) route shows: route, seats, price, pickup, driver impact (+km/+min), new ETA, response-by deadline | `B.request-inbox.overlapping-request-shape-complete` | FAIL (partial) — all fields present except deadline |
| M-060 | §21 | Driver can tap directly into passenger profile and into full request detail from the inbox | `C.driver-inbox.tap-through-to-profile-and-detail` | PASS |
| M-061 | §22 | Request detail shows passenger+reputation, both routes, overlap, pickup, dropoff, price, seats, request time, deadline, detour distance/time, updated ETA, maps nav — reachable WITHOUT going through My Trip first | `B.request-detail.driver-detail-shape-complete`, `C.driver-inbox.detail-reachable-directly` | FAIL (partial) — deadline missing, everything else present |
| M-062 | §22 | Detail map visualizes original route → requested deviation → resulting route | `C.request-detail.map-shows-deviation` | (inferred) PARTIAL |
| M-063 | §23 | Driver pickup/dropoff maps icon opens exact location in native Maps app | `C.driver-trip.maps-deeplink-to-pickup` | PASS |

## Section 24–28: Pricing, capacity, existing-passenger protection, admin config

| ID | Spec ref | Behavioral requirement | Test(s) | Current result |
|---|---|---|---|---|
| M-070 | §24 | Passenger booking a segment pays a segment-appropriate price, not the driver's full listed price | `B.pricing.segment-price-less-than-full-route` (=V.journey-2) | FAIL (incorrect) — flat `contributionPerSeat × seats`, unconditional |
| M-071 | §24 | Segment price for the FULL route (driver's own endpoints) still equals (or is consistent with) the reference price | `A.pricing.full-route-segment-equals-reference-price` | PASS (trivially true today since it's the only case that works) |
| M-072 | §24 | First-segment, middle-segment, and final-segment prices are each independently computed off real segment distance/duration | `A.pricing.first-segment`, `A.pricing.middle-segment`, `A.pricing.final-segment` | FAIL (missing) |
| M-073 | §24 | Multiple concurrent passengers on different segments are each priced independently (not splitting one fare) | `B.pricing.multi-passenger-independent-pricing` | FAIL (missing) |
| M-074 | §24 | Sequential turnover (A exits, B boards) re-prices correctly for B's own segment | `B.pricing.sequential-turnover-repricing` (=V.journey-4/10) | FAIL (missing) |
| M-075 | §24 (explicit) | Segment price is NOT a rigid proportional pro-rate of distance alone — reference price/detour/occupancy/route economics are legitimate inputs | `A.pricing.not-naive-proportional` — **AMBIGUOUS, see Ambiguity Log A-1** | N/A — spec deliberately underspecifies the formula |
| M-080 | §25, §62 (hard) | No route segment ever exceeds physical seat capacity | `A.capacity.canonical-three-seat-abc-example`, `A.capacity.reject-overbooked-segment` | PASS (booking-acceptance layer, real integration test already exists) |
| M-081 | §25 | Segment capacity constraint applies to: search, candidate pooling, request validation, acceptance, pricing, driver itinerary, live matching (ALL of these, not just acceptance) | `B.search.segment-aware-not-global-scalar` (=EDGE-capacity-search-1) | FAIL (incorrect) — search still gates on flat `seatsAvailable` |
| M-082 | §26 | System continuously searches for new feasible requests as seats free up mid-route (turnover) | `B.matching.turnover-reopens-eligibility` | FAIL (missing) — no re-matching trigger; compounded by in-progress exclusion |
| M-083 | §27 | New request evaluated against ALL existing confirmed/onboard passengers, not just capacity | `A.existing-passenger-impact.new-request-checked-against-each-existing` (=EDGE-052) | FAIL (missing) — grep confirms zero `existingPassenger`/`etaImpact` references |
| M-084 | §27 | Existing passenger ETA is a soft estimate — small delay (e.g. +15min/3h trip) acceptable, substantial delay is not | `A.existing-passenger-impact.small-delay-acceptable`, `A.existing-passenger-impact.large-delay-rejected` | FAIL (missing) |
| M-085 | §28 | Constraints (max detour, ETA impact, walk thresholds, deviation threshold, timing tolerance) are admin-configurable, not hardcoded | `matching-thresholds.admin-config-contract.test.ts` (real, executed, confirms the gap) | FAIL (missing) — confirmed live: `getMatchingThresholds`/`detourAllowanceSec` take no config/override parameter at all; `MAX_DETOUR_RATIO` is a plain hardcoded module constant. Pattern exists for `pricing_configs`, never extended to matching/detour thresholds. |
| M-086 | §28 | Not exposed as ordinary end-user configuration in v1 | `matching-thresholds.admin-config-contract.test.ts` | PASS (trivially, nothing is exposed to anyone yet, confirmed) |

## Section 29–37: Live journey — route concepts, in-progress matching, tracking, lifecycle, boarding, no-show

| ID | Spec ref | Behavioral requirement | Test(s) | Current result |
|---|---|---|---|---|
| M-090 | §29, §62 | "Planned route" (as published) and "live feasible corridor" (current reality) are distinct concepts — planned route is never overwritten by live deviation | `A.route-concepts.planned-route-immutable-after-deviation` | FAIL (missing) — no live-corridor concept exists at all |
| M-091 | §30, §62, edge 50 | In-progress ride is matchable against current position + remaining route; a pickup already behind the driver is never offered | `B.matching.in-progress-still-ahead-matches`, `B.matching.in-progress-already-passed-rejected` (=V.journey-5) | FAIL (missing) |
| M-092 | §30 | In-progress match computes: current position, expected pickup time, pickup feasibility, remaining route, detour, new ETA, available segment capacity, existing-passenger impact | `B.matching.in-progress-match-shape-complete` | FAIL (missing) |
| M-093 | §31 | Driver location tracked privately pre-boarding for operational purposes (state inference, ETA, live matching, past-segment exclusion) — continues even with nobody onboard | `A.tracking.private-telemetry-continues-with-no-passenger` | PASS (broadcast infra exists) but feeds nothing yet (M-090/091) |
| M-094 | §32, §62 (hard) | Pre-boarding: passenger sees ETA/pickup/route info, NEVER raw driver GPS | `B.tracking.pre-boarding-no-raw-gps-exposed` (=EDGE-privacy-1) | FAIL (incorrect) — `getTrackingState` returns raw lat/lng for `driver_approaching/pickup` too |
| M-095 | §32 | Post-boarding: passenger-facing live tracking (position, progress, ETA) becomes available | `B.tracking.post-boarding-live-position-available` | PASS |
| M-096 | §33 | Boarding inferred from MULTIPLE signals (proximity, sustained proximity, movement, route context, timing, confirmations) — button is accelerator, not sole trigger | `A.boarding.multi-signal-not-single-gps-check`, `A.boarding.sustained-not-momentary` | FAIL (incorrect) — driver-tap-only, no auto path at all |
| M-097 | §33 | System conservative when evidence ambiguous (doesn't guess) | `A.boarding.ambiguous-evidence-no-transition` | FAIL (missing) — untestable since no inference exists; documents the gap |
| M-098 | §34 | Trip lifecycle: SCHEDULED → IN_PROGRESS → PASSENGER_ONBOARD → COMPLETED, with CANCELLED/NO_SHOW as valid terminal branches; finer internal states acceptable if they map correctly | `A.lifecycle.state-machine-maps-to-spec-four-states` | PASS (existing 6-state enum maps correctly; documented reconciliation, not a defect) |
| M-099 | §35 | Trip can auto-transition scheduled→started without a button tap, using time+origin-proximity+movement+route-progress evidence | `A.lifecycle.auto-start-from-evidence` (=EDGE-autostart-1) | FAIL (missing) — 100% manual |
| M-100 | §35 | A single weak signal (e.g. only "time reached") is insufficient — needs corroborating evidence | `A.lifecycle.auto-start-requires-corroboration` | FAIL (missing) — untestable, documents the gap |
| M-101 | §36, §62 (hard) | No cancellation permitted once journey has genuinely started — enforced server-side, not UI-only | `A.cancellation.booking-cancel-rejected-after-start`, `A.cancellation.ride-cancel-rejected-after-start` | FAIL (incorrect) at ride level — booking-level guard (`assertTripNotStarted`) is correct; ride-level `cancelRide` has no such guard |
| M-102 | §37 | No-show is contextual: relevant only around scheduled pickup time + location + physical proximity + expected arrival window — not purely self-report on a timer | `A.no-show.requires-time-and-location-corroboration` | FAIL (partial) — time gate only, zero location signal despite data availability |
| M-103 | §37 | Either party can report a no-show | `B.no-show.driver-can-report`, `B.no-show.passenger-can-report` | PASS |
| M-104 | §37 | VAYA MAY automatically classify a no-show when evidence is sufficiently strong (not mandatory, but must not be precluded) | `A.no-show.auto-classification-possible-in-principle` | FAIL (missing) — no auto-classification exists |

## Section 38–45: Cancellation, notifications, confirmed views, My Trip, live journey, completion, reviews

| ID | Spec ref | Behavioral requirement | Test(s) | Current result |
|---|---|---|---|---|
| M-110 | §38 | Pre-trip-start: both driver and passenger can cancel with a lightweight required reason from a fixed set | `B.cancellation.reason-required-from-fixed-set`, `V.journey-7-cancellation` | **FAIL (incorrect), corrected this session** — was PASS; confirmed live that `POST /bookings/:bookingId/cancel` has no request body at all and `cancelBooking` takes no reason param anywhere server-side; a cancel with zero reason succeeds today. See the M-110-CORRECTION row (§19 section) for the full finding. |
| M-111 | §38 | Cancellation propagates to: booking, matching, candidate pools, seats, notifications, lifecycle, search eligibility, related requests | `B.cancellation.booking-cancel-full-propagation`, `B.cancellation.ride-cancel-full-propagation` (=M-140 EDGE-046) | FAIL (incorrect) for ride-level cancel — zero cascade; PASS for booking-level cancel |
| M-112 | §38 | Historical cancellation records are preserved, not deleted | `A.cancellation.history-preserved-not-deleted` | PASS |
| M-113 | §39 | Notification fires for each of the 12 named lifecycle events with specific (non-generic) copy | `notification-event-coverage.contract.test.ts` (real, executed, 14/14 pass — confirms exactly which events exist/don't) | FAIL (partial), confirmed live against the real schema enum — 7/12 exist and specific; 4/12 have no event TYPE at all in `notificationEventTypeEnum` (deadline-approaching, siblings-cancelled, passenger-onboard, route/ETA-changed — not just "not dispatched", structurally absent); 2 conflated-but-functional by design (trip-started reuses `trip_driver_approaching`, review-requested reuses `trip_completed`) |
| M-114 | §39 | Repeated GPS pings never generate duplicate notifications (idempotency) | `A.notifications.gps-ping-does-not-spam` | PASS (WebSocket-only for ETA updates, no notification row created) |
| M-115 | §40 | Confirmed-booking passenger view shows: driver, route, passenger itinerary, pickup, walk/PT instructions, pickup ETA, dropoff, passenger ETA, price, trip info, current state, next action, deadline-if-pending | `B.booking-confirmed.passenger-view-shape-complete` | FAIL (partial) — deadline missing, rest present |
| M-116 | §41 | Driver's My Trip dynamically incorporates each accepted passenger's pickup/dropoff into the itinerary in correct sequence order | `B.driver-my-trip.itinerary-includes-passengers-in-sequence` | PASS (route_stops sequencing) |
| M-117 | §41 | For each passenger, driver sees pickup, dropoff, timing, passenger route, detour, resulting ETA | `B.driver-my-trip.per-passenger-detail-shape` | PASS |
| M-118 | §42 | Passenger's My Trip shows only their own relevant journey (requested journey, actual pickup/dropoff, pickup ETA, destination ETA, walk/PT, driver info, status) — not forced to parse the whole driver route | `B.passenger-my-trip.scoped-to-own-journey` | PASS |
| M-119 | §43 | Once onboard: live position, route progress, destination, ETA, relevant info surfaced to passenger; driver gets operational info to continue | `B.tracking.post-boarding-full-shape` (=M-095 extended) | PASS |
| M-120 | §44, §62 (hard) | Completion never depends solely on a button; VAYA auto-closes using proximity/progress/time/movement/location | `A.completion.auto-complete-gps-proximity`, `A.completion.auto-complete-staleness-sweep` (=V core regression) | PASS (two independent real mechanisms, verified race-safe) |
| M-121 | §44 | Users may confirm completion, but journey never remains open forever if ignored | `A.completion.abandoned-trip-eventually-closes` | PASS (staleness sweep) |
| M-122 | §45 | Review is fast/tactile/gesture-based/low-typing, not a generic bureaucratic form; both sides can review the other | `B.reviews.both-sides-can-submit`, `C.reviews.gesture-based-star-input` | PASS (mechanism) / (inferred) PARTIAL on "gesture-based/visually engaging" bar per audit §2.6 |
| M-123 | §45 | Review cannot be duplicated (one per tripId × raterUserId) | `B.reviews.no-duplicate-submission` | PASS |
| M-124 | §45 | Review prompt appears at the correct lifecycle stage (post-completion) | `B.reviews.prompt-timing-post-completion` | PASS |
| M-125 | §45 | Ignored review never blocks trip completion | `B.reviews.ignored-review-does-not-block-completion` | PASS |

## Section 46–56: Named edge cases

| ID | Spec ref | Behavioral requirement | Test(s) | Current result |
|---|---|---|---|---|
| EDGE-046 | §46 | Driver cancels before trip: bookings closed, seats released, matching stopped, passengers notified, search eligibility updated, history preserved, stale requests unacceptable after | `B.cancellation.ride-cancel-full-propagation` (=M-111), `B.cancellation.stale-request-not-acceptable-after-ride-cancel` | FAIL (incorrect) — zero cascade |
| EDGE-047 | §47 | Passenger cancels: capacity recalculated, driver itinerary updated, driver notified, other passengers unaffected, trip integrity preserved | `B.cancellation.passenger-cancel-recomputes-capacity`, `B.cancellation.passenger-cancel-does-not-affect-others` (=V.journey-7) | PASS |
| EDGE-048 | §48 | Driver rejects one request: only that closes; others remain active until accepted/expired/cancelled/invalidated | `B.booking.reject-closes-only-that-request` (=M-057) | PASS |
| EDGE-049 | §49, §62 | First driver accepts: booking confirmed, sibling requests cancelled, candidate capacity released, matching updated, other drivers notified, passenger UI updated, atomic under concurrency | `B.booking.concurrent-accept-exactly-one-wins` (same ride), `B.booking.first-acceptance-cancels-siblings` (cross-ride, =M-055) | PASS (single-ride atomicity) / FAIL (missing) (cross-ride siblings) |
| EDGE-050 | §50 | If driver's live position has passed the requested pickup corridor, do not return the trip — enforced at the matching layer | `B.matching.in-progress-already-passed-rejected` (=M-091) | FAIL (missing) |
| EDGE-051 | §51 | Driver deviates from planned route: planned route retained, live corridor updated, ETA recalculated, future matching opportunities recalculated, existing passengers preserved, affected users informed of meaningful changes | `A.route-concepts.deviation-preserves-planned-retains-history`, `A.route-concepts.deviation-distinguishes-noise-from-real-reroute` | FAIL (missing) — no route-deviation handling exists at the booking/matching layer |
| EDGE-052 | §52 | New request evaluated against new passenger + driver + every existing passenger (capacity, detour, timing, route); rejected if impact exceeds limits, proceeds if acceptable | `A.existing-passenger-impact.*` (=M-083/084) | FAIL (missing) for impact/timing; PASS for capacity-only |
| EDGE-053 | §53 | Passenger chooses a technically-feasible-but-driver-unfriendly point: recalculated, consequence shown, request still allowed, driver sees exact impact, no hidden penalty | `B.booking.passenger-override-not-blocked-when-feasible` (=M-040) | FAIL (missing) |
| EDGE-054 | §54, §62 | No driver stop configured does not block a feasible match — stops are a preference signal, not a hard requirement | `bookings-inv07-stop-not-required.integration.test.ts` (=M-021) | **REFINED, see M-021** — PARTIAL, not blanket FAIL |
| EDGE-055 | §55 | Every passenger independently represented: board point, exit point, occupied segments, route impact, price, ETA — never assume full-route travel | `A.capacity.per-passenger-independent-segments` (PASS), `A.pricing.per-passenger-independent-price` (=M-073, FAIL) | MIXED — segments PASS, price FAIL |
| EDGE-056 | §56 | Never bare "no rides found" if alternatives exist; show best-available + transparent alternatives | `B.search.cascade-exhausts-before-empty` (=M-035) | PASS |

## Section 62: Critical backend invariants (must all be independently tested, hard gates)

| ID | Spec ref | Invariant | Test(s) | Current result |
|---|---|---|---|---|
| INV-01 | §62 Search | Past passenger segments never returned | `B.search.past-trip-excluded`, `B.search.in-progress-past-segment-excluded` | PASS (over-satisfied for the wrong reason, see M-033/034) |
| INV-02 | §62 Capacity | No route segment ever exceeds physical vehicle capacity | `A.capacity.canonical-three-seat-abc-example`, `A.capacity.reject-overbooked-segment`, `B.capacity.concurrent-accept-cannot-oversell` | PASS |
| INV-03 | §62 Requests | First accepted request wins for a passenger journey | `B.booking.first-acceptance-cancels-siblings` | FAIL (missing) cross-ride; PASS single-ride |
| INV-04 | §62 Cancellation | No cancellation after trip start | `A.cancellation.booking-cancel-rejected-after-start`, `A.cancellation.ride-cancel-rejected-after-start` | MIXED (booking PASS, ride FAIL) |
| INV-05 | §62 Lifecycle | Trips cannot remain indefinitely active | `A.completion.abandoned-trip-eventually-closes` | PASS |
| INV-06 | §62 Tracking | Private driver telemetry and passenger-facing live location are separate permission/data flows | `B.tracking.pre-boarding-no-raw-gps-exposed` | FAIL (incorrect) |
| INV-07 | §62 Matching | A driver-selected stop is not required for a feasible passenger match | `bookings-inv07-stop-not-required.integration.test.ts` | **REFINED, see M-021** — PASS at booking layer, PARTIAL at search layer (OSRM-gated fallback tier only) |
| INV-08 | §62 Route | Planned route and live feasible corridor are distinct concepts | `A.route-concepts.planned-route-immutable-after-deviation` | FAIL (missing) |
| INV-09 | §62 Passenger protection | New requests cannot create unreasonable impact on existing passengers | `A.existing-passenger-impact.large-delay-rejected` | FAIL (missing) |

---

## Vertical journeys (§49/spec's own "Journey 1–10" framing, cross-layer)

**Status: all 10 written AND executed this session as real Playwright HTTP journeys against the live server + real Postgres/Redis** (`tests/e2e/tests/journeys/*.api.test.ts`) — 12 individual test cases across the 10 files, run together in one full suite pass: **5 passed, 7 failed**, every result read from the actual run, not inferred. This is the first time this matrix's V-01..V-10 row has reflected an executed result rather than a projection from code-reading.

| ID | Scenario | Test(s) | Current result (verified this session) |
|---|---|---|---|
| V-01 | Full-route passenger: publish → search → request → accept → start → board → complete → both review | `journey-1-full-route.api.test.ts` | **PASS end-to-end** (confirmed live) |
| V-02 | Mid-route passenger (Hammamet→Sousse on a Tunis→Monastir ride): sub-segment discoverable, priced independently of the full route | `journey-2-mid-route.api.test.ts` | **FAIL (confirmed live)** — `contributionTotal` (52 DT) exactly equals the full-route price; booking/search mechanics themselves work correctly |
| V-03 | Early-segment passenger (origin→Hammamet on a Tunis→Monastir ride) | `journey-3-early-segment.api.test.ts` | **FAIL (confirmed live)** — same root cause as V-02 |
| V-04 | Sequential turnover: passenger A takes the ride's only seat on the first leg, passenger B still books the later non-overlapping leg | `journey-4-sequential-turnover.api.test.ts` | **PASS (confirmed live)** — segment-aware capacity holds correctly over real HTTP |
| V-05 | Active-trip discovery: driver has started their trip and reports a position with a genuinely feasible remaining corridor ahead; a new passenger searches that remaining leg | `journey-5-active-trip-discovery.api.test.ts` | **FAIL (confirmed live)** — the ride is completely absent from search the instant `rides.status` flips to `in_progress`; the audit's own P0 gap, now proven end-to-end over the real search endpoint |
| V-06 | Three alternative requests for the same journey across 3 different drivers; a 4th is attempted; the 2nd (B) is accepted first | `journey-6-three-alternatives.api.test.ts` | **FAIL (confirmed live)** — the 4th request succeeds (200, not the expected 409); after B's acceptance, siblings A and C are still confirmed `pending`, not auto-cancelled |
| V-07 | Cancellation: (a) cancel with no reason; (b) driver cancels the whole ride | `journey-7-cancellation.api.test.ts` (2 cases) | **FAIL, both cases (confirmed live)** — (a) a reason-less cancel succeeds (200, not 400) — reclassifies M-110 from PASS to FAIL, see below; (b) after the driver cancels the ride, the passenger's booking still reads `accepted`, confirming EDGE-046's "zero cascade" finding live |
| V-08 | No-show: too-early report rejected; genuine report after the grace period succeeds with a real consequence | `journey-8-no-show.api.test.ts` (2 cases) | **PASS, both cases (confirmed live)** — the time-gate and automatic-rating-consequence mechanism both work correctly end-to-end; the separately-tracked location-corroboration gap (M-102) has no request-body field to even exercise via HTTP today, so it isn't asserted here (see the test file's own doc comment) |
| V-09 | Pre-boarding tracking privacy: a not-yet-boarded passenger polls tracking state while the driver is genuinely broadcasting a live position | `journey-9-gps-privacy-and-uncertainty.api.test.ts` | **FAIL (confirmed live)** — `getTrackingState` returns the driver's real, raw `currentLat`/`currentLng` to a passenger who hasn't boarded yet (INV-06 violated for real, not just by code inspection) |
| V-10 | Capacity race: two simultaneous real HTTP accept requests together exceed a ride's capacity | `journey-10-capacity-race.api.test.ts` | **PASS (confirmed live)** — exactly one of the two concurrent accepts succeeds (409 on the loser), proving `bookings.service.ts`'s atomic seat-accounting holds through the full HTTP/Fastify/DB stack, not just the bare service function |

---

## Ambiguity log

Per phase rule §4 ("if genuinely ambiguous, document — don't silently reinterpret"):

- **A-1 (§24 pricing formula):** Spec explicitly rules out "rigid proportional formula" but does not specify the replacement formula — calls it "an engine concern... audited against the existing implementation rather than blindly rewritten." Tests in this suite (`M-070` through `M-074`) assert the *observable property* that segment price is a function of the segment's own distance/duration/detour and is strictly less than the full-route price for a strict sub-segment, and independently verifiable per concurrent passenger — without asserting a specific formula. This is the smallest robust interpretation; a specific formula is a product decision, not encoded here.
- **A-2 (§27/§28 "substantial" delay threshold):** Spec gives one example (+15min acceptable on a 3h trip) but no general formula (percentage? absolute cap? scales with trip length?). Tests assert the qualitative property (small delay accepted, large delay rejected) using the spec's own example as the boundary-adjacent case, and flag the exact threshold curve as needing a product decision — see report's Product Ambiguities section.
- **A-3 (§33/§35 auto-inference "sufficiently strong evidence"):** Spec intentionally leaves the exact signal-combination threshold unspecified ("conservative when ambiguous"). Tests assert only the structural property (single momentary signal insufficient; multiple corroborating + sustained signals sufficient) rather than a specific algorithm.
- **A-4 (§37 no-show "sufficient evidence"):** Same category as A-3, applied to no-show corroboration.
- **A-5 (§20 "same journey" identity):** The spec assumes passenger requests can be grouped as "the same journey" but doesn't define the grouping key (exact origin/destination equality? radius? time-window?). Audit's own Decision #1 flags this as unresolved. Tests define "same journey" for fixture purposes as (same riderId, same requested origin within 500m, same requested destination within 500m, same requested-time window ±30min) — documented as a test-fixture convention, not a product decision, and called out explicitly in the report.
- **A-6 (§35 auto-start, added this session):** `evaluateAutoStart`'s contract test (`packages/domain/src/trip/__tests__/auto-start-inference.contract.test.ts`) treats `timeReached` as a required anchor signal — at least one further corroborating signal (origin proximity / sustained movement / route progress) on top of it, never those three alone before the scheduled time. This is a documented interpretation choice, not the only one the spec's own wording permits (it lists time as one signal among several, not explicitly mandatory) — flagged here so a future session doesn't mistake it for a settled product decision.

---

## Coverage summary

- Spec sections 1–63 (core model, principles, publishing, search, ranking, request, pricing, capacity, tracking, lifecycle, cancellation, notifications, reviews): **all mapped**, IDs M-001…M-125. Two reclassifications: M-110 PASS → FAIL (incorrect); M-021/EDGE-054/INV-07 blanket FAIL → PARTIAL (booking layer PASSES, search layer gated behind OSRM availability) — both confirmed by real executed tests, not re-reading code.
- Named edge cases §46–56: **all 11 mapped**, IDs EDGE-046…EDGE-056.
- Critical backend invariants §62: **all 9 mapped**, IDs INV-01…INV-09.
- Vertical journeys (spec's own §61 audit-journey framing + task's Journey 1–10): **all 10 mapped AND EXECUTED** as real HTTP journeys — 12 cases, 5 passed / 7 failed, every result verified live (see table above and `docs/tdd_journey_test_report.md`).
- Layer A (pure domain): 12 contract test files (3 original regression-locks + 7 RED specs for missing pure behavior + 2 new this increment: admin-config-gap confirmation, canonical-corridor pricing already covered). 3 areas deliberately deferred (stop corridor-intent/joint-optimization, pedestrian-zone/no-stopping-feasibility rejection) — see `docs/tdd_journey_test_report.md`'s §9a.
- Layer B (API/integration), this increment's additions: `bookings-inv07-stop-not-required.integration.test.ts` (M-021/EDGE-054/INV-07 refinement — real, executed, 2/2 pass), `bookings-deadline-visibility.contract.integration.test.ts` (M-054 — real, executed, 2/2 pass, confirms absence), `notification-event-coverage.contract.test.ts` (M-113 — real, executed, 14/14 pass, confirms exactly which of the 12 named events exist), `matching-thresholds.admin-config-contract.test.ts` (M-085/M-086 — real, executed, 4/4 pass, confirms the gap).
- Total individually testable requirements: **~100**, backed by the test suite described in `docs/tdd_journey_test_report.md`.
