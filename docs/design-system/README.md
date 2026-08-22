# VAYA Design System

This is the formal specification of `@vaya/design-system`. It documents what exists today (extracted directly from `packages/design-system/src`), what's missing, and the rules future screens must follow. **Every future screen must compose these primitives/tokens instead of inventing one-off styling.** If a screen needs something the system doesn't have, the fix is a new reusable primitive in `packages/design-system`, not a local `StyleSheet`.

## Brand character

VAYA's visual identity (product name in-app currently reads "arc." — see Open Decisions in root `CLAUDE.md`) is a warm, muted, soft-edged aesthetic: navy ink, sage-green accents, cream neutrals, generous radii, restrained shadows. It reads as calm and trustworthy rather than energetic or corporate — closer to a considered travel/hospitality brand than a generic ride-hailing app. This character is the strongest asset in the current codebase and must not be diluted by default Material/iOS styling, saturated "alert" colors, or sharp-cornered dashboard aesthetics.

## Tokens

### Colors (`tokens/colors.ts`)

A deliberate 3-tone palette, explicitly derived from the original product mockups.

| Role | Base | Light | Dark |
|---|---|---|---|
| Brand / primary (solid CTAs, headers, ink) | `#2E3B42` | `#4B5960` | `#1C2429` |
| Accent / secondary (route lines, dots, meter fill, stars) | `#7FA491` | `#A8C4B6` | `#587566` |

Neutrals: warm cream-to-ink 11-step scale, `gray50 #FAF8F2` → `gray900 #26333A` — note this is a **warm** gray, not a cold/blue-gray, matching the cream surface direction. Never substitute a cold gray scale.

Semantic (each with Light/Dark variant, deliberately muted/desaturated to match the restrained palette — do not brighten these into saturated "alert" red/green):

| Semantic | Base |
|---|---|
| Success | `#587566` |
| Warning | `#B08A4E` |
| Error | `#A65C4E` |
| Info | `#5B7D8A` |

Map-specific tokens (already exist, use these instead of inventing map colors): `mapRouteLine`, `mapCorridorFill` (rgba sage), `mapTileTint #EDEBE1`, `mapDriverMarker`/`mapPickupMarker` (navy), `mapUserMarker` (sage).

Trust tokens: `trustBarFill`/`ratingStar` (sage), `trustBarTrack` (`#E2E8E4`).

**Dark mode — resolved.** `theme/palette.ts` + `theme/AppThemeProvider.tsx` (`useAppTheme()`) is a second, separate light/dark token pair, mounted once at `apps/mobile/app/_layout.tsx`'s root and following the device's `useColorScheme()` by default. It's a *different* palette from the one above — a cool lavender-white/near-black/emerald-mint scheme pulled directly from the "Vaya Passenger Journey UX" Stitch reference, a deliberate product decision (not a dilution) for the rider search + booking-request flow (`explore.tsx`, `search/composer.tsx`, `search/results.tsx`, `search/cluster.tsx`, `search/trust.tsx`, `search/reviews.tsx`, `bookings/confirmed.tsx`, `bookings/pending.tsx`). `darkPalette` is derived, not from a second Stitch mockup set (which was light-only), but from the *other* already-dark-toned roles a real Material-3 export always carries (inverse/fixed surfaces). Screens not yet migrated keep reading the original `colors` token unchanged — this is additive, not a replacement of the table above, and the two token systems are not meant to be mixed within one screen.

**Profile hub migrated (2026-08).** `(tabs)/profile.tsx` is rebuilt from the "Main Profile - World-Class Hub" mockup (same Stitch project; reference saved at `stitch/main-profile-world-class-hub.{html,png}`) on `useAppTheme()` tokens. Real data replaces the screen's old mock seed: identity/initials from `GET /users/me`, trust-tier pill from Phase 9's trust summary (`TRUST_TIER_LABELS`), photo upload via `/uploads` → `PATCH /users/me` (new `updateMe` mutation), locale picker now persists through the same endpoint instead of local-only state. Mockup deviations, each documented in the screen header: no hamburger (no drawer exists to open); a Notifications row added under Compte so Phase 7's inbox keeps an entry point; unbuilt rows (Paiement, mot de passe…) render disabled with a trailing "Bientôt" rather than a chevron promising dead navigation; Apparence shows its real value ("Automatique") since theming follows the system setting.

### Typography (`tokens/typography.ts`)

System font via `Platform.select` (iOS System / Android Roboto) — **no custom brand typeface is loaded today.** Scale: `xs 12 → 4xl 36`. Weights: regular 400 / medium 500 / semibold 600 / bold 700. Line-heights: tight 1.2 / normal 1.5 / relaxed 1.75. `textStyles` (h1–caption/label) compose fontSize×lineHeight directly — **use these, don't hardcode `fontSize`/`fontWeight` in screens.**

### Spacing (`tokens/spacing.ts`)

4px base unit, 11 steps: `none 0, xs 4, sm 8, md 12, lg 16, xl 20, 2xl 24, 3xl 32, 4xl 40, 5xl 48, 6xl 64`.

### Radii (`tokens/radii.ts`)

`none 0, sm 4, md 8, lg 12, xl 16, 2xl 24, full 9999`. Cards/pills/inputs consistently use `xl`/`2xl`/`full` — nothing sharp-cornered. This softness is part of the brand character; don't introduce `sm`/`none` radii on primary surfaces.

### Elevation (`tokens/elevation.ts`)

Platform-branched (iOS shadow props vs. Android `elevation`), 5 levels none→xl. Calibrated (Phase 2) to match `Card`'s original hand-tuned soft shadow (`md` is deliberately identical to Card's pre-token values) rather than Material-default opacity/radius — the scale is the brand's restrained aesthetic, not a generic default. `Card`, `FieldCard`, `ReviewCard`, `StatTile` (all `sm`/`md`), `Modal` (via `Card`), `BottomSheet` (`xl`, upward-facing), and `Toast` (`lg`) all consume it. `DriverMapPin`'s tighter, punchier shadow (opacity 0.12, small radius) is a deliberate exception — map pins need more contrast against varied map backgrounds than the token scale provides; don't force it onto the scale.

## Component inventory

### Exist today (27 primitives, `primitives/index.ts`)

**Core**: `Text` (variant-based h1/h2/h3/body/bodySmall/caption/label, RTL-aware), `Button` (variant primary/secondary/outline/ghost × size sm/md/lg, pill radius, built-in loading spinner), `Input` (label/error/helperText, focus border color — no icon slot yet), `Card`, `Badge` (5 semantic variants), `Avatar` (initials fallback, deterministic color-hash), `Chip`, `Divider`, `Icon` (thin wrapper over `@expo/vector-icons` Ionicons, fixed size scale + color tokens).

**Layout**: `Stack`/`Row`/`Screen`/`Container` — real flex-based layout primitives, not ad hoc per-screen flexbox.

**Interaction layer** (Phase 2 — `docs/roadmap/phase-02-design-system-interaction-layer.md`): `BottomSheet` (snap-to-open modal sheet, swipe-down + backdrop dismiss, keyboard-avoiding — built on core RN `Animated`/`PanResponder`, not Reanimated/gesture-handler, to avoid a second animation-library surface for one primitive), `Modal` (centered confirm/cancel dialog composing `Card`), `ToastProvider`/`useToast` (queued, max-2-visible, auto-dismiss for success/info, manual-dismiss for errors), `SkeletonBlock`/`SkeletonCircle`/`SkeletonText` (opacity-pulse loading placeholders), `EmptyState` (icon/title/description/action/children composition, generalized from `results.tsx`'s original bespoke pattern).

**Domain-specific** (this is what makes VAYA not feel like a generic CRUD kit — keep extending in this direction): `FieldRow`/`FieldCard` (pickup/dropoff dot+label pill), `Meter` (reliability/punctuality bar, now a real `progressbar` for assistive tech), `StatTile`, `StepProgress` (segmented onboarding stepper — completed segments sit solid in `accent`, the current segment sweeps its fill in with a 650ms eased wipe (skipped under the OS reduce-motion setting), upcoming ones stay faint `outlineVariant` tracks; accepts an optional `theme` prop for `useAppTheme()` colors, defaulting to the legacy static tokens where unmigrated; real `progressbar` role/value for assistive tech; consumed by the driver-verification flow's vehicle/CaptureCamera/selfie headers), `ReviewCard` (accepts an optional `theme` prop for `useAppTheme()` colors, defaulting to the legacy static tokens where unmigrated), `DriverListCard` (avatar+name+rating+time+price+walk-distance ride-match row for the search Results list and Route Map's bottom card; takes its `theme` explicitly, no palette opinion of its own), `ClusterMarker` (concentric "radar ping" for journey clustering), `DriverMapPin` (compact/full variants with zoom-scale), `MapCanvas`/`MapPreview`/`MapRoute` (real `react-native-maps` primitives as of Phase 3 — see below), `StatusBarBlend` (progressive frosted-glass strip sized to exactly the OS status-bar zone over full-bleed map screens — five pixel-snapped blur bands ramping toward the top plus a theme-background wash so clock/battery/signal icons stay legible on any tile color in both schemes; decorative, pointer-transparent, hidden from the accessibility tree; first consumer is explore.tsx's top edge).

### Still missing — build when a phase actually needs them

| Primitive | Why it's deferred |
|---|---|
| `SegmentedControl`, `Switch`/`Checkbox`/`Radio`, continuous `ProgressBar`, `Tooltip`, `Accordion` | No screen has needed one yet — building ahead of a real use case is exactly the premature-abstraction this system's rules warn against. |

### Map system — real as of Phase 3

`MapCanvas`, `MapPreview`, and `MapRoute` are now real `react-native-maps` wrappers, not the CSS-art placeholder they were through Phase 2:

- `MapCanvas` — a real `MapView` (children must be `Marker`/`Polyline`/etc., matching react-native-maps' own constraint — no more arbitrarily-positioned overlay `View`s), with a low-opacity `mapTileTint` wash on top and a `SkeletonBlock` shown until `onMapReady` fires. Falls back to a wide Tunis-centered region if no `region` prop is given.
- `MapPreview` — a small, non-interactive `MapView` snapshot (`scrollEnabled`/`zoomEnabled`/`pitchEnabled`/`rotateEnabled` all `false`) for list/card contexts, taking `origin`/`destination`/`routeCoordinates` (react-native-maps' native `{latitude, longitude}` shape — decode a polyline string with `apps/mobile/src/utils/polyline.ts`'s `decodePolyline` upstream, MapPreview doesn't do that decoding itself) and rendering real `Marker`/`Polyline` children, with custom circular dot markers (`mapUserMarker`/`mapDriverMarker` colors) instead of react-native-maps' default teardrop pins.
- `MapRoute` — a thin `Polyline` wrapper (`mapRouteLine` stroke), with an optional wider, lower-opacity underlay (`mapCorridorFill`) as a cheap visual approximation of the route-overlap corridor concept from `matching.service.ts` — not precise offset-polygon geometry, just a glow; build the exact geometry only if a future phase actually needs it rendered precisely.
- `packages/design-system/src/utils/mapGeometry.ts` dropped its old fraction/pixel-space geometry functions (`computeRouteGeometry`, `evenlySpacedPointsAlong`) — they had no real-map equivalent use and no consumer outside the placeholder primitives themselves. `regionForPoints` (a real react-native-maps region-fitting utility) stays.
- **`search/pickup-point.tsx` was explicitly NOT touched by Phase 3** — at that point it was still the fake, non-geospatial pixel-projection canvas (`PX_PER_DEGREE = 9000`) it always was; its *interaction model* (candidate-stop selection) depended on the ride-engine work and was deferred to Phase 5. **Phase 5 has since rebuilt it fully**: real `MapCanvas` with numbered stop markers, a `BottomSheet` for stop detail, `EmptyState` for the zero-viable-stops case — no pixel-projection code remains. See `docs/domain/ride-engine.md` and the roadmap's Phase 5 notes.
- `search/cluster.tsx` already used real `react-native-maps` directly (bypassing these primitives entirely) before Phase 3 — unchanged.
- Android needs a real Google Maps API key (`GOOGLE_MAPS_API_KEY` in `apps/mobile/.env`, see `.env.example`) to render tiles on a real device/build; this is a genuine external setup step, not something this session can generate a working key for. iOS uses Apple Maps by default, no key needed.

## Motion & haptics

`haptics` (`utils/haptics.ts`, exported from the package root) wraps `expo-haptics` with four semantic calls — `haptics.success()`, `.selection()`, `.warning()`, `.error()` — each fire-and-forget (haptic hardware absence is not an error). Wired into OTP verification, booking requests, and ride publishing (both their success and error paths) as of Phase 2; extend to new mutation flows as they're built rather than calling `expo-haptics` directly. `react-native-reanimated`/`react-native-gesture-handler` remain unused by the design system — `BottomSheet`, `Modal`, `Toast`, and `Skeleton`'s animations all use core RN `Animated`/`PanResponder` instead (see Component inventory above for why).

## Accessibility

Baseline pass complete (Phase 2) across all 19 pre-Phase-2 primitives plus the 6 new ones. Pattern: interactive primitives (`Button`, `ClusterMarker`, `DriverMapPin`, `FieldRow` when pressable) get `accessibilityRole="button"` and a label defaulting to their visible text, overridable via an `accessibilityLabel` prop; informational primitives (`Chip`, `Badge`, `StatTile`, `ReviewCard`) group their content into one accessible node instead of letting screen readers read fragments separately (this matters most for `ReviewCard`'s star rating, previously five separate "★" glyphs); progress-like primitives (`Meter`, `StepProgress`) use `accessibilityRole="progressbar"` with a real `accessibilityValue`; purely decorative visuals (`Divider`, the map primitives' route lines/markers/street-grid) are hidden from the accessibility tree via `accessibilityElementsHidden`/`importantForAccessibility="no-hide-descendants"` rather than being silently read as unlabeled elements. `Card` and the `Stack`/`Row`/`Screen`/`Container` layout primitives intentionally carry no accessibility props of their own — they're content-agnostic containers; their children carry the real semantics. `Text` needed no baseline change — RN's `Text` already exposes its content to screen readers, and `TextComponentProps extends TextProps` already lets callers pass `accessibilityLabel` through.

Not yet done: dynamic-type/font-scaling consideration, and contrast has not been formally verified against WCAG AA (visually likely fine given the muted palette, but unverified).

## Responsive behavior

Not deeply audited this pass — no explicit breakpoint tokens exist. Mobile-only (no tablet-specific layout logic found). Treat as acceptable for a phone-first carpooling app; revisit only if tablet support becomes a real requirement.

## Rules for future work

1. **No raw React Native primitives in screens.** `View`/`Text`/`TextInput`/`TouchableOpacity`/`StyleSheet.create` with hardcoded colors, spacing, or radii is a violation. Current discipline is good (22/27 screens correctly import from `@vaya/design-system`, only ~2 hex + ~11 low-severity `rgba` leaks found) — keep it that way.
2. **If a screen needs a pattern the system doesn't have, build the primitive first.** The `otp.tsx` glassmorphism OTP pill is the cautionary example: a good, distinctive result built entirely from local styling instead of graduating into a reusable primitive. The visual result was right; the process was wrong.
3. **Consume tokens, don't hand-roll equivalents.** Especially elevation/shadows today.
4. **Every new primitive needs at minimum a smoke test** (existing `tokens.test.ts`/`primitives.test.ts` pattern) and accessibility props from day one, not retrofitted later.
5. **No Storybook exists yet.** Until one does, this document is the enforcement mechanism — any PR introducing new visual patterns should update this file in the same change.
