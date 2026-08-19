# Target Driver Journey

This is the experience the roadmap builds toward, not what exists today. Current-state gaps are noted inline with links to `docs/product/audit.md`. Screen names are proposed; adjust to fit `apps/mobile/app` conventions during implementation.

## 1. Create ride

**Today:** `driver/publish.tsx` — origin text field, destination text field, departure-time preset, seat stepper, free-typed price with no ceiling. No stops, no route intelligence. (`docs/product/audit.md` §4)

**Target flow:**
1. Driver picks origin and destination (map-first, existing `search/location.tsx` pattern is fine here — reuse it).
2. App computes the real route via OSRM (already wired for `rides`/`matching` — `docs/product/audit.md` §3) and shows it on a real map (post map-system replacement, `docs/design-system/README.md`).
3. **Candidate stops** are generated along that route automatically (`docs/domain/ride-engine.md`) — driver selects which of the suggested stops they're willing to serve, rather than typing coordinates. No arbitrary pin-drop.
4. Departure date/time (supports recurring pattern selection, leveraging the existing but unused `recurring-patterns` table — see Phase: Recurring Rides).
5. Seats available (stepper, existing pattern is fine).
6. **Suggested price** is computed from route distance/duration (`docs/domain/pricing.md`) and shown as a default; driver can adjust within a bounded range, not type an arbitrary number.
7. Preferences (chattiness, smoking, pets, luggage — informed by `docs/product/benchmark.md` §1) — profile-level defaults, overridable per ride.
8. Review & publish — single confirmation screen summarizing route, stops, price, seats.

**States:** loading while OSRM route/stop candidates compute (skeleton, not spinner); empty state if no viable stops are found near the route (rare, but must have a message + fallback to manual pin-in-bounds); error state if route computation fails (OSRM down → haversine fallback already exists server-side, surface this gracefully, don't error out).

**Design-system work needed:** real map primitives (replacing `MapCanvas`/`MapPreview`), a stop-selection list/sheet component (`BottomSheet`), a bounded price-adjustment component (slider or stepper with visible min/max), haptic feedback on publish success.

## 2. Booking requests & passenger management

**Today:** `bookings` API supports accept/decline/cancel with seat accounting (has a known concurrency bug, `docs/product/audit.md` §3). No driver-facing UI for managing incoming requests was found; no push notification exists to alert the driver a request arrived. (MISSING)

**Target flow:**
1. Driver receives a push notification when a passenger requests/books a seat.
2. A requests list (or inbox) shows pending requests with passenger name, rating/tenure signal (trust visible before commitment — `docs/ux/principles.md` #7), requested pickup point, seat count.
3. Driver accepts or declines per request (instant-accept or request-to-book, per ride settings — mirrors BlaBlaCar's dual model, `docs/product/benchmark.md` §1).
4. On accept, seats decrement atomically (fixes the current race condition) and both sides get a confirmation notification.

## 3. Communication

**Today:** No messaging screen exists at all. (MISSING)

**Target:** A lightweight per-trip conversation (not a general chat/social feature) becomes available once a booking is confirmed, scoped to that ride. See roadmap Phase: Messaging.

## 4. Trip day

**Target flow:** driver sees today's confirmed passengers and stops in route order; live status (en route / arrived at stop / trip started / completed) updates via the existing `trips` table; if a driver can't reach a passenger, they can cancel that specific booking and mark it (mirrors BlaBlaCar's unreachable-passenger flow, `docs/product/benchmark.md` §1) rather than cancelling the whole ride.

## 5. Completion & rating

**Target:** post-trip prompt to rate each passenger within a defined window (24h, mirroring the benchmark), feeding into the passenger's visible trust signal for future drivers. See roadmap Phase: Ratings & Trust.

## Where this diverges from "just add features"

The onboarding flow (`driver/onboarding/*`) is already the app's best work — live-camera KYC, real verification-document handling. The driver journey above deliberately reuses that quality bar's underlying infrastructure (OSRM, real matching, real domain state machines in `packages/domain`) rather than introducing a parallel ad hoc system for ride creation.
