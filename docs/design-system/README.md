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

**No dark-mode palette exists.** Single light theme only — treat dark mode as an explicit future decision, not an assumption (see Open Decisions).

### Typography (`tokens/typography.ts`)

System font via `Platform.select` (iOS System / Android Roboto) — **no custom brand typeface is loaded today.** Scale: `xs 12 → 4xl 36`. Weights: regular 400 / medium 500 / semibold 600 / bold 700. Line-heights: tight 1.2 / normal 1.5 / relaxed 1.75. `textStyles` (h1–caption/label) compose fontSize×lineHeight directly — **use these, don't hardcode `fontSize`/`fontWeight` in screens.**

### Spacing (`tokens/spacing.ts`)

4px base unit, 11 steps: `none 0, xs 4, sm 8, md 12, lg 16, xl 20, 2xl 24, 3xl 32, 4xl 40, 5xl 48, 6xl 64`.

### Radii (`tokens/radii.ts`)

`none 0, sm 4, md 8, lg 12, xl 16, 2xl 24, full 9999`. Cards/pills/inputs consistently use `xl`/`2xl`/`full` — nothing sharp-cornered. This softness is part of the brand character; don't introduce `sm`/`none` radii on primary surfaces.

### Elevation (`tokens/elevation.ts`)

Platform-branched (iOS shadow props vs. Android `elevation`), 5 levels none→xl. Calibrated (Phase 2) to match `Card`'s original hand-tuned soft shadow (`md` is deliberately identical to Card's pre-token values) rather than Material-default opacity/radius — the scale is the brand's restrained aesthetic, not a generic default. `Card`, `FieldCard`, `ReviewCard`, `StatTile` (all `sm`/`md`), `Modal` (via `Card`), `BottomSheet` (`xl`, upward-facing), and `Toast` (`lg`) all consume it. `DriverMapPin`'s tighter, punchier shadow (opacity 0.12, small radius) is a deliberate exception — map pins need more contrast against varied map backgrounds than the token scale provides; don't force it onto the scale.

## Component inventory

### Exist today (26 primitives, `primitives/index.ts`)

**Core**: `Text` (variant-based h1/h2/h3/body/bodySmall/caption/label, RTL-aware), `Button` (variant primary/secondary/outline/ghost × size sm/md/lg, pill radius, built-in loading spinner), `Input` (label/error/helperText, focus border color — no icon slot yet), `Card`, `Badge` (5 semantic variants), `Avatar` (initials fallback, deterministic color-hash), `Chip`, `Divider`, `Icon` (thin wrapper over `@expo/vector-icons` Ionicons, fixed size scale + color tokens).

**Layout**: `Stack`/`Row`/`Screen`/`Container` — real flex-based layout primitives, not ad hoc per-screen flexbox.

**Interaction layer** (Phase 2 — `docs/roadmap/phase-02-design-system-interaction-layer.md`): `BottomSheet` (snap-to-open modal sheet, swipe-down + backdrop dismiss, keyboard-avoiding — built on core RN `Animated`/`PanResponder`, not Reanimated/gesture-handler, to avoid a second animation-library surface for one primitive), `Modal` (centered confirm/cancel dialog composing `Card`), `ToastProvider`/`useToast` (queued, max-2-visible, auto-dismiss for success/info, manual-dismiss for errors), `SkeletonBlock`/`SkeletonCircle`/`SkeletonText` (opacity-pulse loading placeholders), `EmptyState` (icon/title/description/action/children composition, generalized from `results.tsx`'s original bespoke pattern).

**Domain-specific** (this is what makes VAYA not feel like a generic CRUD kit — keep extending in this direction): `FieldRow`/`FieldCard` (pickup/dropoff dot+label pill), `Meter` (reliability/punctuality bar, now a real `progressbar` for assistive tech), `StatTile`, `StepProgress` (onboarding stepper, now a real `progressbar`), `ReviewCard`, `ClusterMarker` (concentric "radar ping" for journey clustering), `DriverMapPin` (compact/full variants with zoom-scale), `MapCanvas`/`MapPreview`/`MapRoute` (currently stylized **placeholders** — see below).

### Still missing — build when a phase actually needs them

| Primitive | Why it's deferred |
|---|---|
| `SegmentedControl`, `Switch`/`Checkbox`/`Radio`, continuous `ProgressBar`, `Tooltip`, `Accordion` | No screen has needed one yet — building ahead of a real use case is exactly the premature-abstraction this system's rules warn against. |

### Map system — replace, don't extend

`MapCanvas`/`MapPreview`/`MapRoute` are explicitly commented in-source as placeholders (`MapCanvas.tsx:29`) pending a swap to `react-native-maps`, which is already a mobile dependency. The passenger pickup-point screen (`search/pickup-point.tsx`) goes further — it's a fake, non-geospatial pixel-projection canvas (`PX_PER_DEGREE = 9000`, explicitly commented "not geographically accurate"). Real map rendering is a prerequisite for the ride-engine work (`docs/domain/ride-engine.md`) and should land as its own roadmap phase before stop-selection UX is built on top of it. When rebuilt, the new map primitives must consume the existing map color tokens (`mapRouteLine`, `mapCorridorFill`, etc.) rather than introducing new ones.

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
