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

Platform-branched (iOS shadow props vs. Android `elevation`), 5 levels none→xl. **Rule going forward: components must consume this token, not hand-roll shadow values** (existing violation: `Card` uses inline `shadowOpacity: 0.06, shadowRadius: 14` — fix opportunistically, don't block on it).

## Component inventory

### Exist today (19 primitives, `primitives/index.ts`)

**Core**: `Text` (variant-based h1/h2/h3/body/bodySmall/caption/label, RTL-aware), `Button` (variant primary/secondary/outline/ghost × size sm/md/lg, pill radius, built-in loading spinner), `Input` (label/error/helperText, focus border color — no icon slot yet), `Card`, `Badge` (5 semantic variants), `Avatar` (initials fallback, deterministic color-hash), `Chip`, `Divider`.

**Layout**: `Stack`/`Row`/`Screen`/`Container` — real flex-based layout primitives, not ad hoc per-screen flexbox.

**Domain-specific** (this is what makes VAYA not feel like a generic CRUD kit — keep extending in this direction): `FieldRow`/`FieldCard` (pickup/dropoff dot+label pill), `Meter` (reliability/punctuality bar), `StatTile`, `StepProgress` (onboarding stepper), `ReviewCard`, `ClusterMarker` (concentric "radar ping" for journey clustering), `DriverMapPin` (compact/full variants with zoom-scale), `MapCanvas`/`MapPreview`/`MapRoute` (currently stylized **placeholders** — see below).

### Missing — build once, as shared primitives, before screens improvise them locally

| Primitive | Why it's needed now |
|---|---|
| `BottomSheet` | Every future selection UI (stop picker, filters, ride details) will want this |
| `Modal` / `Dialog` | Confirmations (cancel booking, etc.) |
| `Toast` / `Snackbar` | Non-blocking feedback (booking accepted, network error) — today errors are inline red text only |
| `Skeleton` | Loading states are `ActivityIndicator` everywhere; no shimmer/skeleton exists |
| `EmptyState` | `results.tsx` has a genuinely good bespoke empty state (fallback search + "notify me" CTA) — generalize it into a primitive instead of leaving it one-off |
| `Icon` (wraps `@expo/vector-icons`) | Icons are imported raw per-screen today; centralize size/color/registry |
| `SegmentedControl`, `Switch`/`Checkbox`/`Radio`, continuous `ProgressBar`, `Tooltip`, `Accordion` | Standard needs that will otherwise be improvised ad hoc |

### Map system — replace, don't extend

`MapCanvas`/`MapPreview`/`MapRoute` are explicitly commented in-source as placeholders (`MapCanvas.tsx:29`) pending a swap to `react-native-maps`, which is already a mobile dependency. The passenger pickup-point screen (`search/pickup-point.tsx`) goes further — it's a fake, non-geospatial pixel-projection canvas (`PX_PER_DEGREE = 9000`, explicitly commented "not geographically accurate"). Real map rendering is a prerequisite for the ride-engine work (`docs/domain/ride-engine.md`) and should land as its own roadmap phase before stop-selection UX is built on top of it. When rebuilt, the new map primitives must consume the existing map color tokens (`mapRouteLine`, `mapCorridorFill`, etc.) rather than introducing new ones.

## Motion & haptics

**Missing entirely.** `expo-haptics` is a zero-usage dependency-not-even-installed gap — no tactile feedback exists anywhere (booking confirm, OTP verify, publish, errors). When built, wrap it in a thin `haptics.ts` utility with semantic calls (`success`, `selection`, `warning`) tied to key moments, not raw `Haptics.impactAsync()` calls scattered through screens. `react-native-reanimated` v4 and `react-native-gesture-handler` are already dependencies — no motion primitives currently exist in the design system, but the underlying capability is present.

## Accessibility

**Missing entirely.** No `accessibilityLabel`/`accessibilityRole`/`accessibilityHint` on any primitive, no dynamic-type/font-scaling consideration, contrast not formally verified against WCAG AA (visually likely fine given the muted palette, but unverified). This needs a baseline pass on all 19 existing primitives before the primitive count grows much further — retrofitting accessibility across 40+ primitives later is much more expensive than building it into the next 10.

## Responsive behavior

Not deeply audited this pass — no explicit breakpoint tokens exist. Mobile-only (no tablet-specific layout logic found). Treat as acceptable for a phone-first carpooling app; revisit only if tablet support becomes a real requirement.

## Rules for future work

1. **No raw React Native primitives in screens.** `View`/`Text`/`TextInput`/`TouchableOpacity`/`StyleSheet.create` with hardcoded colors, spacing, or radii is a violation. Current discipline is good (22/27 screens correctly import from `@vaya/design-system`, only ~2 hex + ~11 low-severity `rgba` leaks found) — keep it that way.
2. **If a screen needs a pattern the system doesn't have, build the primitive first.** The `otp.tsx` glassmorphism OTP pill is the cautionary example: a good, distinctive result built entirely from local styling instead of graduating into a reusable primitive. The visual result was right; the process was wrong.
3. **Consume tokens, don't hand-roll equivalents.** Especially elevation/shadows today.
4. **Every new primitive needs at minimum a smoke test** (existing `tokens.test.ts`/`primitives.test.ts` pattern) and accessibility props from day one, not retrofitted later.
5. **No Storybook exists yet.** Until one does, this document is the enforcement mechanism — any PR introducing new visual patterns should update this file in the same change.
