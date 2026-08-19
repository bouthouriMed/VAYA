# VAYA Current-State Audit

**Date:** 2026-08-19
**Method:** full read-only pass over `apps/mobile`, `apps/api`, `packages/*`, `docker/`, `tests/e2e` by four parallel audit passes (mobile UX/nav/state, backend API/domain/DB, design-system tokens/components, root config/e2e/api-client/admin). No code was changed to produce this document.

**Headline finding:** VAYA is not a green-field product. It already has a real OSRM-backed routing engine (Tunisia road-network extract), a genuinely sophisticated matching algorithm with polyline route-overlap scoring, a rich 14-table domain schema, a distinctive and intentional 3-tone brand identity, and a driver-onboarding flow (live-camera KYC) that is production-grade. The gaps are concentrated in three places: **the ride engine has no stop/waypoint intelligence** (single origin→destination only, and the passenger pickup-point picker is an explicitly-fake, non-geospatial demo), **pricing is completely unconstrained** (drivers type any number), and **several screens present fabricated data after a real API call succeeds** (the booking-confirmation flow). Treat this as a product with strong bones that needs its two hardest subsystems (ride engine, pricing) built for the first time, plus a set of concrete bugs and gaps fixed — not a rewrite.

Legend: **KEEP** (correct, extend as-is) · **IMPROVE** (right shape, needs work) · **REFACTOR** (wrong shape, salvage the parts) · **REPLACE** (throw away, rebuild) · **MISSING** (doesn't exist).

---

## 1. Screens & navigation

| Area | Verdict | Notes |
|---|---|---|
| Expo Router structure (`(auth)`, `(tabs)`, route groups) | **KEEP** | Idiomatic, correct auth-gated `Redirect` in `(tabs)/_layout.tsx`. |
| Root layout auth hydration | **IMPROVE** | `AuthHydrator` renders `null` while SecureStore loads tokens — blank frame, not a branded splash. |
| Screen inventory (27 route files) | Mixed | See §4/§5 below — driver onboarding is the quality bar; post-booking screens are the low point. |
| Messaging screen | **MISSING** | No conversation/chat UI anywhere. |
| Ratings/review submission screen | **MISSING** | No UI to rate a driver/passenger after a trip. |
| Notifications inbox | **MISSING** | No screen, and no push channel to populate one (see §7). |
| Recurring-ride screen | **MISSING** | `recurring-patterns` table exists in the DB (§3) but no UI. |
| Cancellation flow UI | **MISSING** | No screen or affordance to cancel a ride/booking from the mobile app. |
| Deep linking | **MISSING** | Not configured. |

## 2. Design system & visual identity

Full detail in `docs/design-system/README.md`. Summary:

| Area | Verdict | Notes |
|---|---|---|
| Color palette (3-tone: navy `#2E3B42`, sage `#7FA491`, warm-cream neutrals) | **KEEP** | Distinctive, cohesive, intentional — the strongest asset in the codebase. Formalize as brand law, never dilute with generic Material/iOS defaults. |
| Spacing (4px base, 11 steps) / radii (0→9999, soft-by-default) | **KEEP** | Consistent, well-adopted. |
| Typography scale | **IMPROVE** | Scale itself is fine; no custom typeface (system font only) reads generic; screens override with arbitrary sizes outside the scale (e.g. `otp.tsx` uses `fontSize: 34`, `fontWeight: '800'` not in any token). |
| Elevation/shadow tokens | **IMPROVE** | Token exists (`tokens/elevation.ts`) but components hand-roll shadow values instead of consuming it (`Card` uses inline `shadowOpacity: 0.06`). Needs enforcement, not redesign. |
| Core primitives (Button, Input, Card, Text, Badge, Avatar, Chip, Divider, layout primitives) | **KEEP, extend** | Solid variant+size API. `Input` has no icon slot; no `focus`/`error` visual language pass done yet. |
| Domain primitives (FieldRow, Meter, StatTile, StepProgress, ReviewCard, ClusterMarker, DriverMapPin) | **KEEP** | Real evidence of product-specific design thinking — rare and valuable, this is what keeps VAYA from feeling like generic CRUD. Keep extending in this direction rather than adding generic components. |
| Map system (`MapCanvas`/`MapPreview`/`MapRoute`) | **REPLACE (planned)** | Explicitly a placeholder per its own source comments (`MapCanvas.tsx:29`: "Phase 9 swaps it for react-native-maps") — CSS-art street grids simulating roads, not real tiles/geometry. |
| BottomSheet / Modal / Toast-Snackbar / Skeleton / EmptyState / SegmentedControl | **MISSING** | Zero components. Screens will keep improvising local overlays until these exist as shared primitives. |
| Icon system | **IMPROVE** | `@expo/vector-icons` (Ionicons) imported raw per-screen; no design-system `Icon` wrapper governing size/color/registry centrally. |
| Haptics | **MISSING** | Zero `expo-haptics` usage anywhere in the app — no tactile feedback on booking confirm, OTP verify, publish, errors. |
| Accessibility | **MISSING** | No `accessibilityLabel`/`accessibilityRole`/`accessibilityHint` on any primitive; no dynamic-type consideration; contrast not formally verified. |
| Storybook / visual style-guide | **MISSING** | No visual reference exists in-repo; without one, "reuse the design system" is unenforceable — `otp.tsx` already improvises a from-scratch glassmorphism OTP pill instead of graduating it into a primitive. |
| Design-system discipline in screens | **KEEP, tighten** | 22/27 screens import from `@vaya/design-system`; only 2 raw hex colors and ~11 raw `rgba(...)` literals found outside the package (mostly translucent overlay interpolation, low severity). This is genuinely good discipline for a codebase this size. |

## 3. Backend, domain & database

| Area | Verdict | Notes |
|---|---|---|
| `rides` module | **KEEP/IMPROVE** | Create/list/get/cancel wired to real OSRM (`getRoute`) for polyline+duration; ownership checks via `ForbiddenError`; status transitions via `canTransitionRideStatus` from `@vaya/domain`. No waypoints. |
| `bookings` module | **IMPROVE — has a real bug** | Full accept/decline/cancel lifecycle with seat accounting, creates a `trips` row on accept. **Concurrency bug**: `acceptBooking` (`bookings.service.ts:97-113`) checks `seatsAvailable` then updates in a separate statement with no transaction/row lock — two concurrent accepts can both pass the check and oversell seats. Real bug, not hypothetical. |
| `matching` module | **KEEP — genuinely strong** | Tight/wide radius search, time-window scoring, haversine + real polyline-overlap corridor matching (`computeRouteOverlapFraction`, 150m corridor), demand-signal fallback when nothing matches. This is a real ranking algorithm and should be the seed for the target ride-engine design, not replaced. |
| `routes` module | **REFRAME** | Only `getRouteById` exists. The `routes` table is a **static seeded route catalog** (fixed origin/destination pairs with baked-in min/recommended/max contribution in `seed.ts`), not a computed route+pricing engine. |
| `drivers`, `users`, `auth`, `ratings`, `geocoding`, `uploads`, `health` | Present | Routes+services exist for each; auth uses `@fastify/jwt`. Not deep-audited this pass. |
| Database schema (14 tables) | **KEEP the model, extend it** | `rides`, `routes`, `bookings`, `trips`, `driver-profiles`, `vehicles`, `verification-documents`, `demand-signals`, `recurring-patterns`, `relationship-signals`, `notifications`, `ratings` — a genuinely rich model already in place. |
| Geospatial columns | **IMPROVE (fine for now)** | Plain `doublePrecision` lat/lng, no PostGIS. All proximity search happens in application code via haversine after a time-windowed row fetch. Adequate at current scale; will not scale past tens of thousands of concurrently published rides — see `docs/architecture/overview.md` SCALE section. |
| DB indexes | **MISSING, high priority** | Zero explicit indexes beyond PK/unique across both migrations. `rides.departureAt`/`rides.status` are queried directly in the matching hot path and are unindexed, as are FK columns. Cheap fix, should happen NOW. |
| Stop/waypoint model | **MISSING** | `rides`/`bookings` carry only single origin/destination/pickup lat-lng pairs. No `route_stops` or equivalent table. Confirms the ride-engine work (§ domain/ride-engine.md) needs new schema, not a rework of existing tables. |
| Pricing enforcement | **MISSING, confirmed** | `routes.minContribution`/`recommendedContribution`/`maxContribution` exist as columns but are hardcoded in `seed.ts`, computed by no formula anywhere in the codebase. `validation/rides.ts` only constrains `contributionPerSeat` to be a positive number — nothing ties it to the route bounds. Drivers can and do enter arbitrary prices today. |
| `packages/domain` | **KEEP the pattern** | `booking-status.ts`/`ride-status.ts` define explicit state-transition tables consumed correctly by the service layer — this is the one place business rules correctly live outside controllers, matching the CLAUDE.md "no business logic in controllers" rule. Mostly `*.types.ts` shape definitions beyond the status machines — extend this pattern for the ride-engine/pricing domain logic rather than putting it in `apps/api`. |
| Validation & error handling | **KEEP** | Zod schemas per module actually wired into services; `error-handler.ts` dispatches correctly on `AppError` subclasses. |
| Rate limiting | **MISSING** | No `@fastify/rate-limit` registered — needed before any public exposure. |
| Background jobs/queue | **MISSING** | No BullMQ or equivalent found; `notifications` table exists but no dispatch mechanism was located. |
| Caching | **KEEP** | `lib/redis.ts` + `lib/cache.ts` exist and are used by matching/geocoding/routing — real caching layer, not aspirational. |
| Routing infra (OSRM) | **KEEP — a real asset** | Self-hosted OSRM with a Tunisia road-network extract (`docker-compose.yml`), real polyline+ETA, with documented haversine fallback if OSRM isn't running. This is materially more than most MVPs have and should be leaned on heavily for the ride engine. |
| Backend test coverage | **MISSING, thin** | Only `health.test.ts` and `lib/__tests__/errors.test.ts`. Zero tests for rides, bookings, matching, or pricing — the highest-risk logic (seat accounting, status transitions, matching scoring) is untested. |
| Migrations | **KEEP** | Only 2 migration files, schema is stable, not churning. |

## 4. Mobile ride flows (the product's core loop)

| Flow | Verdict | Notes |
|---|---|---|
| Driver onboarding (`driver/onboarding/*`, live-camera KYC) | **KEEP — reference quality bar** | Most recently built (commit `be670b8`), most production-grade flow in the app. `CaptureCamera.tsx` (388 lines) is a real live-camera component; `selfie.tsx`/`vehicle.tsx` substantial; `license.tsx`/`insurance.tsx` correctly thin (reuse the same capture pattern). |
| Driver ride creation (`driver/publish.tsx`) | **MISSING core intelligence** | Single origin, single destination (same free-text picker riders use), seat stepper (1-8), and **a freely-typed price with no ceiling** (stepper starts at 5 DT, ±1, no cap). No route/stop concept at all — confirms the ride-engine and pricing gaps are real, not assumed. |
| Passenger search & discovery (`search/location.tsx`, `cluster.tsx`, `results.tsx`) | **KEEP, functional** | Real `react-native-maps` usage, real matching API calls, real polyline decode/region-fit utilities. `results.tsx` has a genuinely good empty state (fallback corridor search + "notify me" CTA) — generalize this pattern. |
| Passenger pickup-point selection (`search/pickup-point.tsx`) | **REPLACE — confirmed fake** | Entirely non-geospatial: `PX_PER_DEGREE = 9000` is explicitly commented "arbitrary demo projection: not geographically accurate." A pannable `View` with mock `PLACES` snapping. This is exactly the screen the ride-engine redesign must replace. |
| Booking + trust screen (`search/trust.tsx`) | **KEEP, functional** | Calls the real `createBooking` mutation with real params. |
| Post-booking flow (`bookings/pending.tsx`, `pickup.tsx`, `confirmed.tsx`, `live.tsx`, `settlement.tsx`) | **REFACTOR — looks done, isn't** | A real booking is created via a real API call, then `pending.tsx` immediately displays a hardcoded pickup window ("18:05–18:15"), a hardcoded confidence label ("Élevée"), and a `PICKUP_LABEL` pulled from `src/mocks/seed-data.ts` — none of it derived from the actual booking response. Roughly 3-4 of the 5 post-booking screens are cosmetically wired but semantically fake. **This is the single most important "looks done but isn't" gap in the app.** |
| Notifications | **MISSING, blocking** | No `expo-notifications` anywhere. Blocks driver awareness of new booking requests and blocks the "notify me" corridor-fallback feature from ever firing anything. |
| Error boundary | **MISSING** | No app-level `ErrorBoundary` — an uncaught render error crashes to a blank screen. |
| Loading states | **IMPROVE** | Consistently `ActivityIndicator`, functional but generic; no skeleton components exist (see §2). |
| i18n | **IMPROVE/verify** | fr/ar locale files exist for auth/common/search/bookings/trust; no `en` locale despite the type allowing it; central `i18n.ts` wiring wasn't located in this pass and should be verified before relying on it. |
| Mobile test coverage | **MISSING** | `app.test.ts` is a 7-line placeholder (`expect(true).toBe(true)`). Zero coverage of slices, RTK Query transforms, or screen logic (pickup-point snapping math, cluster grouping, OTP flow) despite substantial logic existing. |
| State management (Redux slices, RTK Query) | **KEEP** | 4 small single-purpose slices, correct 401→refresh→retry interceptor in `api.ts`, well-reasoned cache-key handling in `searchSlice`. Solid layer. |

## 5. Supporting infrastructure

| Area | Verdict | Notes |
|---|---|---|
| `packages/api-client` (generated OpenAPI client) | **KEEP** | Correctly gitignored (`packages/api-client/src/generated/`), generated via `pnpm generate:api-client` against the running API. No issues found. |
| `packages/config` | **MISSING scope** | Only app name/locale/timezone constants today. Will need pricing bounds, route-deviation limits, and other cross-cutting business constants added as the ride engine/pricing land — don't let those constants leak into `apps/api` or `apps/mobile` directly. |
| `tests/e2e` (Playwright) | **MISSING** | Only a health-check test exists. Zero E2E coverage of auth, search, booking, or driver flows — the flows most likely to regress silently. |
| `apps/admin` | **MISSING (scaffold only)** | `src/index.ts` + `.gitkeep`, nothing built. Out of scope for the roadmap unless/until an ops/support need justifies it — do not build speculatively. |
| Docker infra (`docker-compose.yml`) | **KEEP** | Postgres 16, Redis 7, self-hosted OSRM with Tunisia extract and documented one-time `prepare.sh` setup + graceful haversine fallback. Real, well-documented local dev infra. |
| Mobile dependencies | Notable gaps | `react-native-maps` present (real maps available, just not yet used everywhere — see map system above); **no** `expo-notifications`, no analytics/crash-reporting SDK (Sentry, PostHog, Amplitude, etc.), no payments SDK. All three are needed before the corresponding roadmap phases (notifications, analytics events required by this brief, payments) can ship. |

---

## Cross-cutting priority list (unordered by phase, ordered by risk)

1. **Overbooking race condition** in `acceptBooking` — real, exploitable bug under concurrent load.
2. **Unconstrained pricing** — drivers can violate route min/max today; no pricing logic exists anywhere.
3. **Fake pickup-point picker** — a demo screen sitting where the product's most important interaction should be.
4. **Booking-confirmation screens showing fabricated data** after a real booking succeeds — actively misleading to a real user in production.
5. **No DB indexes** on hot-path columns — cheap to fix now, expensive to discover in production.
6. **No push notifications** — blocks driver/passenger awareness of booking events, a core marketplace mechanic.
7. **No rate limiting** — required before any public exposure.
8. **Missing interaction-layer primitives** (BottomSheet/Modal/Toast/Skeleton/EmptyState) — every subsequent screen will keep improvising without these.
