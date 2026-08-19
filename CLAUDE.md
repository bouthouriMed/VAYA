# VAYA

Production carpooling marketplace for Tunisia. Primary client: Expo/React Native mobile app.

## Stack

pnpm workspaces + Turborepo · Expo + React Native + Expo Router (TS strict) · Fastify + Drizzle ORM + PostgreSQL · Redux Toolkit + RTK Query · OpenAPI → generated client → RTK Query · Zod validation · Vitest (unit) + Playwright (E2E) · Docker Compose (Postgres + Redis)

## Layout

```
apps/{mobile,api,admin}
packages/{design-system,api-client,config,validation,domain,eslint-config}
tests/e2e
docker/            # compose for local Postgres + Redis + self-hosted OSRM (Tunisia routing)
docs/              # product/ux/design-system/domain/architecture/roadmap — see docs/product/README.md
```

## Commands

```
pnpm install && docker compose -f docker/docker-compose.yml up -d
pnpm dev:api        # :3000
pnpm dev:mobile      # Expo; add --lan for physical device over LAN
pnpm lint / typecheck / test / format:check
pnpm db:generate / db:migrate / db:studio
pnpm generate:api-client   # requires dev:api running
```

Mobile/API need `.env` (copy from `.env.example`). For Expo Go over LAN, set mobile's `API_BASE_URL` to the host's LAN IP, not `localhost`.

## Rules

- No God components/services, no business logic in UI, no direct HTTP calls from UI (RTK Query only), no direct DB access from controllers
- No circular deps, no premature abstraction/microservices/speculative features, no global mutable state
- No `any` without justification, no silent error swallowing, no secrets in git
- Never hand-edit `packages/api-client/src/generated/` — regenerate instead
- Mobile: feature dirs under `src/features/`; routes compose screens, logic lives in features
- API: Fastify HTTP layer, Zod validation, Drizzle for DB, errors via `AppError` hierarchy
- Reuse `@vaya/design-system` primitives instead of raw RN components

## Product vision

VAYA brings a structured, trustworthy, spatially-intelligent carpooling marketplace to Tunisia — a market with no incumbent international carpooling platform, dominated today by louages and informal social carpooling. VAYA's edge is two things it already does unusually well for its stage: a real driver-verification pipeline (live-camera KYC) and a real road-routing foundation (self-hosted OSRM over a Tunisia extract). The product's job is to build the two systems that are the actual hard part of a carpooling marketplace — route-aware stop selection and bounded pricing — on top of that foundation. Full detail: `docs/product/README.md`.

## Product principles

1. The marketplace's two hardest mechanics — where to stop, what to pay — must never be free-form entry. Always a small, validated, ranked set of choices.
2. Trust must be visible before commitment, not discovered after (ratings/tenure shown pre-booking, not post).
3. Build on what's real, don't rebuild what works — the matching algorithm (`matching.service.ts`), the OSRM routing foundation, the domain state machines (`packages/domain`), and the core design-system primitives are genuine assets.
4. Never let a screen show fabricated success — every field rendered after a mutation must come from that mutation's real response, or show an honest loading/error state.
5. Complexity is added when evidence justifies it, not preemptively (see NOW/NEXT/SCALE in `docs/architecture/overview.md`).

## UX principles

Full detail and anti-patterns: `docs/ux/principles.md`. Summary: spatial/map-first over administrative forms; progressive disclosure over dense screens; every loading/empty/error state is a designed product surface, not a default; before proposing a new screen ask whether the interaction can be simplified, combined, progressively disclosed, or made more contextual instead.

## Design-system rules

Full spec (actual token values, component inventory, gaps): `docs/design-system/README.md`. Hard rules:
- No raw React Native primitives (`View`/`Text`/`TextInput`/`TouchableOpacity`/`StyleSheet.create` with hardcoded values) in screens — use `@vaya/design-system`.
- If a screen needs a pattern the system doesn't have, build the primitive in `packages/design-system` first — don't improvise local styling that should have graduated into a reusable component.
- Consume tokens (`colors`, `spacing`, `radii`, `elevation`, `typography`) — never hand-roll equivalent values.
- VAYA's brand character is warm/muted/soft-edged (navy `#2E3B42`, sage `#7FA491`, warm cream neutrals, generous radii) — never dilute with generic Material/iOS defaults or saturated "alert" colors.
- Every new primitive needs a smoke test and accessibility props (`accessibilityRole`/`accessibilityLabel`) from the start, not retrofitted later.

## Engineering standards

Beyond the base Rules above: pricing and ride-engine business logic belongs in `packages/domain`, never computed client-side or duplicated between mobile and API — the client only ever displays and enforces bounds the server returned. Background job/queue work (notifications, recurring-pattern detection) should stay scoped to one minimal queue, not a general-purpose framework, until a second genuinely distinct use case justifies more. Any endpoint accepting a client-adjustable value that affects marketplace integrity (price, seats, pickup location) must enforce bounds server-side independent of client-side UI constraints.

## Architecture principles

NOW/NEXT/SCALE horizons are explicit and load-bearing — see `docs/architecture/overview.md`. Do not start SCALE-phase work (PostGIS, read replicas, idempotency enforcement, formal abuse prevention) without a measured trigger (real latency numbers, real concurrent load, real observed abuse) — premature optimization here is itself the risk the SCALE phase exists to avoid. Application-level haversine scanning over a time-windowed row fetch (the current matching approach) is intentionally KEEP, not a stopgap to feel guilty about, through the NOW/NEXT range.

## Domain rules

Full model: `docs/domain/model.md`. Source-of-truth table lives there — check it before assuming where a piece of state belongs. Authoritative state machines (`ride status`, `booking status`) live in `packages/domain` and must never be duplicated in `apps/api` controllers or `apps/mobile`. `route_stops` (ride engine, `docs/domain/ride-engine.md`) and `pricing_configs` (pricing, `docs/domain/pricing.md`) are the two new entities the roadmap introduces — read those documents before touching ride creation, matching, or booking-price logic.

## Documentation conventions

- `docs/product/` — vision, audit, benchmark research.
- `docs/ux/` — principles and target journeys.
- `docs/design-system/` — the formal design-system spec (token values, component inventory, rules).
- `docs/domain/` — domain model, ride-engine design, pricing design.
- `docs/architecture/` — system architecture, scalability strategy.
- `docs/roadmap/` — phased roadmap, status tracker, open decisions, blockers (`docs/roadmap/README.md` is the index — read it first).
- `docs/decisions/` — ADRs for major technical choices.
- When a roadmap phase changes what's true in an audit/design doc, update that doc in the same change — these documents describe current reality, not a frozen snapshot.

## Phase execution rules

The roadmap (`docs/roadmap/README.md`) is structured so a session can be told "Implement Phase N" and act on that phase's file alone. Before starting a phase: read its Prerequisites section and confirm they're actually met (check the status table, don't assume). During: follow its Exact scope — resist adding scope not listed there, even if adjacent and tempting (each phase file calls out its own scope-creep risks explicitly). After: update `docs/roadmap/README.md`'s status table and this file's Current implementation status section in the same change that completes the phase.

## Testing requirements

Every phase's Definition of Done includes: unit tests for new business logic (especially anything touching money, seats, or state transitions — the audit found the current biggest gap is exactly here, e.g. the booking-acceptance race condition), an integration test for the phase's primary flow, and for any change touching the core search→match→book loop, an addition to `tests/e2e` (which today has only a health-check test). `pnpm test`, `pnpm typecheck`, and `pnpm lint` must pass before a phase is considered done.

## Definition of Done (general)

A phase is done when: its own file's Definition of Done checklist is fully checked, tests pass, no screen renders fabricated data after a real mutation, no new free-form entry exists for price or pickup location, and the roadmap status tracker reflects the change. "Looks done" (UI renders, no visible error) is explicitly not the bar — the audit's single worst finding was exactly a screen that looked done while showing fabricated data.

## Current implementation status

Full audit: `docs/product/audit.md`. As of 2026-08-19: comprehensive audit and roadmap complete (12 phases, `docs/roadmap/README.md`); Phases 1-7 implemented. The codebase is materially more mature than a typical MVP — real OSRM routing, a genuinely sophisticated matching algorithm, a rich 14-table domain schema, and a production-grade driver-onboarding flow already exist. Both of the audit's two confirmed highest-priority gaps are now addressed: the fake (explicitly non-geospatial) passenger pickup-point picker was retired in Phase 5, and unconstrained pricing was replaced with a computed, bounded suggestion in Phase 6 — though Phase 6's `base_rate_per_km` is explicitly a first-cut value pending business confirmation, not a settled number (see "Important decisions" below).

**Completed phases:**
- **Phase 1 — Foundation Hardening**: fixed the confirmed booking-acceptance race condition (atomic DB-level seat accounting in `acceptBooking`/`cancelBooking`), added missing DB indexes, registered rate limiting, added a root `ErrorBoundary` + branded loading state, and wired the post-booking screens (`pending`/`pickup`/`live`/`settlement`) to real booking/ride data instead of fabricated mock values. Also fixed a real, separate bug found along the way: `AppError`'s constructor was silently breaking `instanceof` narrowing for every subclass.
- **Phase 2 — Design System: Interaction Layer**: added `BottomSheet`, `Modal`, `Toast`/`ToastProvider`, `Skeleton{Block,Circle,Text}`, `EmptyState`, and `Icon` to `@vaya/design-system`; recalibrated the `elevation` token scale to the brand's actual soft-shadow character and migrated `Card`/`FieldCard`/`ReviewCard`/`StatTile`/`Modal`/`BottomSheet`/`Toast` onto it; added a `haptics` utility wired into OTP verify, booking request, and ride publish (success + error paths); completed an accessibility baseline pass (roles/labels/grouping) across all 19 pre-existing primitives plus the 6 new ones. Each new primitive is proven in a real screen (EmptyState/Skeleton/Toast in `search/results.tsx`, Modal/BottomSheet/Icon in `(tabs)/profile.tsx`'s new logout-confirmation and language-picker interactions — the latter previously a dead tap with no handler at all).
- **Phase 3 — Real Map Rendering Foundation**: `MapCanvas`/`MapPreview`/`MapRoute` are now real `react-native-maps` primitives (MapView/Marker/Polyline) instead of the CSS-art placeholder, with a `SkeletonBlock` shown until `onMapReady` and a `mapTileTint` wash consuming the existing map color tokens. `search/cluster.tsx` already used real maps directly (unchanged); `bookings/pickup.tsx`/`live.tsx` now render real `MapPreview`s using real pickup/destination coordinates threaded through the same param-forwarding chain Phase 1 established. `search/pickup-point.tsx` is explicitly untouched — still the fake pixel-projection screen, deferred to Phase 5 by the phase doc itself. Android needs a real `GOOGLE_MAPS_API_KEY` (see `apps/mobile/.env.example`) to render tiles on-device — a genuine external setup step this session couldn't complete on your behalf.
- **Phase 4 — Ride Engine I: Driver Stops**: new `route_stops` table (migration `0003_wide_squadron_supreme.sql`, additive only) plus `apps/api/src/modules/rides/stop-candidates.service.ts` — samples a ride's OSRM route polyline, snaps each sample to the road network via a new `nearestRoad` (`lib/routing.ts`), classifies road suitability, scores/rejects (max-deviation and motorway rules enforced server-side, never just downranked), clusters within the existing `OVERLAP_CORRIDOR_WIDTH_M` (now exported from `matching.service.ts`), and caches generation by route-polyline hash in Redis. New endpoints `POST /rides/:id/candidate-stops`, `PATCH /rides/:id/stops`, `GET /rides/:id/stops` (public selected-only, `?all=true` driver editing view), and `POST /rides/:id/publish` (ride creation now starts `draft`, reusing the previously-unused `draft` ride status and the existing state machine — see `docs/domain/ride-engine.md`'s Phase 4 implementation notes for why). Mobile's `driver/publish.tsx` gained a second step — a real map with tappable candidate markers (`DriverMapPin`) and a `BottomSheet` detail/toggle view — between the existing form and the actual publish action; publishing with zero additional stops always works. **Genuinely verified, not assumed:** unit tests for the scoring/clustering math (20 cases, no network); an integration test run against the real docker-composed OSRM instance + real Postgres (not mocked); a manual run against 3 real Tunisian routes (urban, suburban, intercity) confirming real road-snapped, named candidates and — for the intercity Tunis→Hammamet route crossing the A1 — correct rejection of motorway-speed samples. **Stated limitation, not a gap that was missed:** OSRM's `nearest`/`route` responses in this deployment carry no way-class tag at all (verified live), so road classification uses local travel speed from route annotations instead of the design doc's originally-assumed metadata field — documented in `docs/domain/ride-engine.md`.
- **Phase 5 — Ride Engine II: Passenger Stop Selection**: retires the single worst finding from the original audit — `apps/mobile/app/search/pickup-point.tsx`'s fake pixel-projection screen (`PX_PER_DEGREE = 9000`, a fixed-degrees-per-pixel demo mapping with no real geocoordinates behind it at all) is fully rebuilt around real ride-engine data: a real `MapCanvas`, numbered pins for a matched ride's ranked candidate stops, closest stop pre-selected by default, `BottomSheet` for stop detail, honest `EmptyState` when nothing is in range — zero pixel-projection code remains anywhere in the file. `matching.service.ts`'s `scoreCandidates` now fetches each candidate ride's driver-selected `route_stops` and ranks them by walk-distance (`rankStopsByWalkDistance`, a pure function unit-tested with no DB/OSRM dependency), filtered to `WIDE_PICKUP_RADIUS_M`; each `MatchCandidate` gains `rankedStops` and a `pickupViable` flag. **Zero-viable-stops product decision, made explicitly:** a ride with real stops but none walkable for the passenger is *included* in results flagged `pickupViable: false` rather than silently excluded — this keeps the `pickup_no_viable_stop` analytics event observable through the existing mobile `trackEvent` hook without a second server-side analytics mechanism, while `search/cluster.tsx` still never renders or lets a passenger tap into a non-viable result, so "never offer an impossible pickup" holds at the UI layer regardless (full reasoning in `docs/domain/ride-engine.md`). `bookings.pickup_stop_id` (nullable FK → `route_stops`, `ON DELETE SET NULL`, migration `0004_common_bill_hollister.sql`) is enforced server-side in `bookings.service.ts`: a ride with any selected stops requires a valid same-ride `pickupStopId` and rejects free-form coordinates (400 either way); a ride with zero stops keeps the old free-form flow working unchanged — verified by a dedicated integration test covering all three cases. `explore.tsx`'s pre-search "adjust pickup on map" entry point (which pointed at the old fake screen before any ride was even selected, incompatible with the new screen's required `rideId`) was removed as a direct, necessary consequence of the scope change. **Genuinely verified, not assumed:** unit tests for the ranking/viability pure functions and the mobile stop-selection helpers; an API integration test against real Postgres; and the first real core-loop E2E coverage `tests/e2e` has ever had — a Playwright suite exercising the full HTTP flow (driver onboarding → ride creation → real OSRM-backed candidate generation → stop selection → publish → passenger matching search → booking with `pickupStopId` → both rejection cases → legacy free-form booking) against a live server, real Postgres, and real docker-composed OSRM — all 8 E2E tests (health-check + new suite) passing.

- **Phase 6 — Pricing Engine**: replaces `driver/publish.tsx`'s old unbounded ±1 DT stepper with a computed, bounded suggestion. New `packages/domain/src/pricing` module (`computeSuggestedPrice`, pure/unit-tested) implements `recommended = baseRatePerKm × distanceKm + timeComponentPerMin × durationMin`, an absolute floor for short rides, and a wider min/max spread when the route is a haversine fallback rather than real OSRM data. New `pricing_configs` table (migration `0005_moaning_spiral.sql`), seeded with one active `national` row; `platformFeeRate` defaults to 0 and is not read anywhere — mechanism only, not activated. `POST /rides` now makes `contributionPerSeat` optional (defaults to `recommended`) and returns `{min, recommended, max}` + `routeIsEstimate` alongside the ride; a new `PATCH /rides/:rideId` (draft-only) lets the driver commit an adjusted price, with the server independently re-deriving and re-validating the bound both times — a direct API call with an out-of-bounds value is rejected with a 400 regardless of client behavior (verified by a real-Postgres/real-OSRM integration test, and the existing `tests/e2e` core-loop suite still passes unchanged). Mobile gained a new `PriceRangeStepper` primitive (`packages/design-system`) and a `form → price → stops` flow in `driver/publish.tsx` that makes an out-of-bounds price unrepresentable in the UI. `apps/api/src/db/seed.ts`'s seeded routes/rides/bookings pricing is now entirely formula-derived from real OSRM geometry, not hand-typed — one source of truth. **`base_rate_per_km = 0.25` DT/km and `time_component_per_min = 0.08` DT/min are an autonomously-derived first-cut (Tunisian fuel price × typical compact-car consumption × a cost-sharing markup, documented in `docs/domain/pricing.md`'s "Rate derivation" section), explicitly pending business confirmation — do not treat this as a settled monetization/pricing decision.**
- **Phase 7 — Notifications Foundation**: gives the already-modeled `notifications` table a real delivery mechanism. New `device_tokens` table (migration `0006_greedy_hedge_knight.sql`, one row per user+device, `token` globally unique) + `POST /users/me/push-token`; new `apps/api/src/modules/notifications` module (`GET /notifications`, `PATCH /notifications/:id/read`, dispatch service). First (and, per this phase's explicit scope, only) background job queue in the codebase: one BullMQ queue (`apps/api/src/lib/queue.ts`, its own Redis client pointed at the same `REDIS_URL` as `lib/cache.ts` — a second logical client, not a second Redis, since BullMQ requires `maxRetriesPerRequest: null`), consumed by one standalone worker process (`apps/api/src/worker.ts`) — not a general multi-queue framework. Push send is a direct HTTP call to Expo's push API (`modules/notifications/expo-push.ts`), not `expo-server-sdk` — dependency-free for a 3-event-type minimal dispatch path. `bookings.service.ts`'s `createBooking`/`acceptBooking`/`declineBooking` each gained a best-effort notification-row-creation hook around their existing logic (Phase 1's atomic seat-accounting in `acceptBooking`/`cancelBooking` untouched); a push-send failure is logged and retried via BullMQ's native retry and can never fail the triggering booking call — verified with a real-Postgres/real-Redis integration test that mocks only the Expo HTTP call, not just by inspection. Mobile: `expo-notifications` added; new `apps/mobile/src/services/notifications/` (token registration, contextual permission-prompt timing gated to once per install, foreground-Toast + tap-deep-link wiring, notification copy) and a minimal inbox at `apps/mobile/app/notifications/index.tsx` (list, unread `Badge`, mark-as-read on tap — a `Row`/`Text`/`Icon`/`Badge` composition, no new design-system primitive, per the phase doc). Push permission is requested contextually — after a driver's first ride publish or a passenger's first booking, never on cold start. Deep-linking is scoped to exactly the 3 dispatched event types (all currently resolving to the existing `(tabs)/trips` screen — a dedicated driver "review this request" screen doesn't exist anywhere in this codebase yet, a real gap, not built here). **Deferred, real external-service setup this environment cannot complete** (same category as Phase 3's Google Maps key / Android verification note): live push delivery to a physical device needs real Expo/EAS push credentials (EAS project id, APNs/FCM certs) this sandboxed environment has none of — the full code path is wired and tested with the Expo push HTTP call mocked, but **on-device push delivery verification is an explicit deferred manual step**, not something to claim as done. Full notes: `docs/roadmap/README.md`.

**Current phase:** none in progress.
**Recommended next phase:** Phase 8 — Messaging (`docs/roadmap/phase-08-messaging.md`) — can now rely on Phase 7's delivery mechanism for new-message alerts.

## Important decisions

See `docs/roadmap/README.md`'s Open Decisions section for the full list requiring a human call (confirming the Phase 6 first-cut `base_rate_per_km`, platform fee activation, cancellation policy without a payment system, dark mode scope, messaging moderation). One flagged during the audit and not yet resolved: the mobile app's landing screen renders the product name as "arc.", not "VAYA" — confirm which is correct before it propagates further.

## Things that must NOT be changed casually

- The authoritative state-machine location (`packages/domain` for ride/booking status transitions) — do not reimplement transition logic elsewhere even "just for one screen."
- The OSRM-based routing foundation and its haversine fallback pattern (`lib/routing.ts`) — this is real, working infrastructure; don't replace it with a different routing approach without a documented reason.
- The 3-tone brand color palette (`packages/design-system/src/tokens/colors.ts`) — this is the strongest, most distinctive asset in the current product; don't dilute it toward generic defaults.
- `bookings`/`rides`/`trips` schema's existing columns, once the ride-engine/pricing migrations land — additive changes only (new nullable FKs, new tables), per the explicit backward-compatibility rollout notes in `docs/domain/ride-engine.md` and `docs/domain/pricing.md`. Do not force a hard cutover that breaks rides published before a phase ships.
