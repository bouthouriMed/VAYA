# Target Passenger Journey

This is the experience the roadmap builds toward. Current-state gaps are noted inline with links to `docs/product/audit.md`.

## 1. Search

**Today:** `search/location.tsx` (origin/destination text search, functional, `geocodeSearch`-backed) → `cluster.tsx`/`results.tsx` (real map, real matching API, genuinely good empty-state pattern). **KEEP** this shell — the gap is downstream (pickup selection, booking confirmation), not here. (`docs/product/audit.md` §4)

## 2. Discover rides & compare

**Today:** functional, real `MatchingService` results with route-overlap scoring (`docs/product/audit.md` §3 — the matching algorithm is a genuine strength). Results list should surface, per the benchmark (`docs/product/benchmark.md` §2): price, departure/arrival time, driver trust signal (rating + tenure badge), seats available, and sortable/filterable by these — verify current `results.tsx` exposes sort/filter; if not, this is a small addition, not a rebuild.

## 3. Inspect driver & route

**Today:** `search/trust.tsx` shows driver/route detail and calls the real `createBooking` mutation. **KEEP.** Ensure the trust signal (rating, tenure, verification badge) is prominent here — this is the "trust visible before commitment" principle (`docs/ux/principles.md` #7), and VAYA already has the underlying verification data to show it.

## 4. Select pickup point

**Today:** `search/pickup-point.tsx` is a confirmed fake, non-geospatial demo (`PX_PER_DEGREE = 9000`). **REPLACE.** (`docs/product/audit.md` §4)

**Target flow:** instead of a free pin-drop, the passenger is shown the **ranked candidate stops** the driver already made available for that ride (`docs/domain/ride-engine.md`), pre-filtered to those reasonably close to the passenger's actual origin. Passenger picks one. No arbitrary coordinates enter the system from either side. If no candidate stop is close enough, show an honest "this ride doesn't reach you conveniently" state rather than forcing a bad match — this is a real product decision, not just an edge case, and should point back to search with adjusted filters.

## 5. Price & book

**Today:** price is whatever the driver typed with no validation. **Target:** price is the computed/bounded amount from `docs/domain/pricing.md`, displayed transparently (base fare + any platform fee, mirroring BlaBlaCar's passenger-side fee model, `docs/product/benchmark.md` §4) before the passenger commits. Booking flow itself (instant vs. request-to-book, mirroring the benchmark) — instant booking is likely right for VAYA's early liquidity needs (fewer dead ends), with request-to-book available per-ride at driver discretion, matching current `bookings` module capability.

## 6. Confirmation

**Today:** a real booking is created, then `bookings/pending.tsx`/`pickup.tsx` immediately show hardcoded mock data (pickup window, confidence label, pickup label) instead of the real response. **REFACTOR — this is the single highest-priority UX bug in the app** (`docs/product/audit.md` §4, `docs/ux/principles.md` #2). Target: every field shown post-booking is derived from the real `bookings`/`rides`/`trips` data, or the screen shows an honest loading/error state instead.

## 7. Communication

**Today:** MISSING entirely. **Target:** a per-trip conversation scoped to the confirmed booking (see roadmap Phase: Messaging), plus push notifications for status changes (driver accepted, driver en route, etc.) — notifications are currently entirely absent and block this.

## 8. Trip day

**Target:** live status of the ride (`bookings/live.tsx` exists in the route tree but is likely also mock-data-backed per the pattern above — verify and fix in the same pass as #6), ETA to pickup point, driver contact/communication surfaced.

## 9. Completion & rating

**Target:** post-trip rating prompt within a defined window, contributing to the driver's visible trust signal for future passengers (see roadmap Phase: Ratings & Trust). `bookings/settlement.tsx` exists in the route tree — verify it isn't also serving mock data.

## Cancellation & no-show (missing end to end)

**Today:** no cancellation UI exists anywhere in the app. (`docs/product/audit.md` §1) **Target:** time-based cancellation policy informed by the benchmark (`docs/product/benchmark.md` §2) — e.g. free cancellation well before departure, reduced/no refund close to departure, explicit no-show reporting distinct from cancellation. Exact tiers are a business decision to finalize in the Cancellation & No-Show Policy roadmap phase, not something to hardcode from BlaBlaCar's numbers without a deliberate choice.
