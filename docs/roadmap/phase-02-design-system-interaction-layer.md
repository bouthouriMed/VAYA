# Phase 2 — Design System: Interaction Layer

**Horizon:** NOW · **Estimated complexity:** Medium

## Objective

Build the shared primitives every later phase will otherwise reinvent locally: BottomSheet, Modal, Toast, Skeleton, EmptyState, and a wrapped Icon component — plus a haptics utility and an accessibility baseline across all 19 existing primitives. This phase is a direct prerequisite for Ride Engine (needs BottomSheet for stop selection), Notifications (needs Toast), and every future loading state (needs Skeleton).

## Prerequisites

Phase 1 complete (don't build new UI on top of the booking-confirmation bug).

## Exact scope

1. **`BottomSheet`** — `packages/design-system/src/primitives/BottomSheet.tsx`. Built on `react-native-gesture-handler` + `react-native-reanimated` (both already dependencies). Snap points, backdrop dismiss, keyboard-avoidance.
2. **`Modal`/`Dialog`** — for confirmations (e.g. "cancel this booking?"). Composes `Card` internally, not a new visual language.
3. **`Toast`/`Snackbar`** — a top-level provider (`ToastProvider` + `useToast()` hook) mounted once in `app/_layout.tsx`, queued, auto-dismiss with manual dismiss option.
4. **`Skeleton`** — a shimmer primitive with `SkeletonText`/`SkeletonBlock`/`SkeletonCircle` variants, using `elevation`/`colors.gray100`-family tokens, animated via Reanimated.
5. **`EmptyState`** — generalizes the existing bespoke pattern in `search/results.tsx` (illustration/icon slot, title, description, primary action) into a reusable primitive; then refactor `results.tsx` and `cluster.tsx`'s plain-text empty state to use it.
6. **`Icon`** — thin wrapper over `@expo/vector-icons` Ionicons, exposing a fixed size scale (matching `tokens/spacing.ts`) and color-token props, so raw `Ionicons` imports in screens can be migrated over time (don't force a big-bang migration in this phase — new usage must use `Icon`, existing usage migrates opportunistically).
7. **`haptics.ts` utility** — `packages/design-system/src/utils/haptics.ts`, wrapping `expo-haptics` (new dependency) with semantic calls: `haptics.success()`, `haptics.selection()`, `haptics.warning()`, `haptics.error()`. Wire into: OTP verified, booking confirmed, publish succeeded, form validation error.
8. **Accessibility baseline** — add `accessibilityRole`/`accessibilityLabel` props (with sensible defaults, overridable) to all 19 existing primitives, starting with `Button`, `Input`, `Chip`, `Badge`. Not a full WCAG audit — a baseline so screen readers get correct roles/labels on the components already in wide use.
9. **Elevation token enforcement** — replace `Card`'s inline `shadowOpacity`/`shadowRadius` with `tokens/elevation.ts` values; audit other primitives for the same pattern.

## User flows

No end-user flow changes in this phase — it is infrastructure. Verification happens by using the new primitives in at least one real screen each (see Testing) so they're proven, not just built.

## Screens

No new screens. Touches: `search/results.tsx`, `search/cluster.tsx` (EmptyState migration), `app/_layout.tsx` (ToastProvider mount).

## UX behavior

- BottomSheet: spring-based open/close (Reanimated), backdrop tap and swipe-down both dismiss.
- Toast: non-blocking, stacks max 2 visible, auto-dismiss after ~3s for success/info, requires manual dismiss for errors.
- Skeleton: matches the actual layout it's replacing (not a generic shimmer block) — e.g. a ride-card skeleton mirrors the ride-card's real dimensions.

## Design-system work

This phase *is* the design-system work — see Exact scope above. Update `docs/design-system/README.md`'s "Missing" table to move these items to "Exists" once shipped, and update the component inventory list.

## Frontend

`packages/design-system/src/primitives/*` (new files), `packages/design-system/src/utils/haptics.ts` (new), `packages/design-system/src/tokens/elevation.ts` (enforcement, not new), `apps/mobile/app/_layout.tsx` (ToastProvider), `apps/mobile/package.json` (add `expo-haptics`).

## Backend

None — this phase is entirely client-side/design-system.

## Database

None.

## API

None.

## Business rules

None new — this is presentation-layer infrastructure, not business logic.

## Testing

- Smoke test per new primitive (matching the existing `tokens.test.ts`/`primitives.test.ts` pattern) confirming it renders and exposes expected props.
- At least one real-screen integration using each new primitive (EmptyState in `results.tsx`, Toast triggered from a real mutation success, Skeleton in a real loading state) — proves the primitive works in context, not just in isolation.
- Accessibility: a basic test asserting `accessibilityRole` is present on `Button`/`Input`/`Chip` after the baseline pass.

## Analytics

None new — infrastructure phase.

## Definition of Done

- [ ] BottomSheet, Modal, Toast, Skeleton, EmptyState, Icon exist in `packages/design-system/src/primitives`, exported from `primitives/index.ts`.
- [ ] `haptics.ts` exists and is wired into at least the 4 key moments listed above.
- [ ] All 19 pre-existing primitives have baseline `accessibilityRole`/`accessibilityLabel` support.
- [ ] `Card` and any other shadow-hand-rolling primitive consume `tokens/elevation.ts` instead of inline shadow values.
- [ ] `docs/design-system/README.md` updated to reflect the new inventory.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Dependencies

Blocks: Phase 4/5 (Ride Engine needs BottomSheet for stop selection), Phase 6 (Pricing needs a bounded input control, can reuse `Input`/new slider pattern introduced here if one is built), Phase 7 (Notifications needs Toast for in-app delivery), any phase with a loading state (Skeleton).

## Risks

Scope risk: it's tempting to build every conceivable primitive here. Stick to the list — SegmentedControl, Switch/Checkbox/Radio, Tooltip, Accordion are explicitly deferred to whichever later phase first needs them, per `docs/ux/principles.md`'s "build once, when needed" discipline.
