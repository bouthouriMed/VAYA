/**
 * App theme palette, consumed via `AppThemeProvider`/`useAppTheme()`.
 *
 * A deliberate, from-scratch design pass — not a remap of an existing
 * token set. The brief: make VAYA read as genuinely premium in both light
 * and dark, not "basic black and white with a green accent." The concept:
 * deep charcoal-emerald darkness meets a clean white/cool-blue light mode
 * (revised on direct feedback — the original warm-ivory light mode read
 * as flat/grey rather than premium; the Stitch reference screens this
 * whole flow is built against use a near-white canvas with a light-blue
 * secondary surface, not a warm cream), unified by one saturated
 * jewel-tone emerald accent (not a muted "eco-app sage" — a confident
 * gem-green with real presence). `ink` stays the palette's "real black"
 * role in both modes — the thing an active filter pill, an own-message
 * bubble, or any other deliberately-black moment should key off, per
 * this same direct feedback ("leave the black").
 *
 * Dark mode is unchanged by this revision — only `lightPalette` moved off
 * the warm-cream family; `ink`/`background` are still never flat
 * `#000000` in dark mode.
 *
 * A flat set of solid hex fills reads as premium-adjacent at best — every
 * genuinely premium app (Linear, Arc, Stripe's own dashboard) builds depth
 * through gradient and light, not just color choice. So beyond the flat
 * roles above, each palette also carries a small set of gradient/sheen
 * tokens (`*Gradient` two-stop tuples for `expo-linear-gradient`, plus
 * `glimmer` — a translucent highlight for a diagonal sheen overlay on a
 * card or button, the thing that makes a jewel-tone surface actually catch
 * light instead of sitting flat). These aren't a parallel palette; they're
 * richer renderings of the same four roles (background, surface, accent,
 * ink) for the specific surfaces — hero backgrounds, primary CTAs, glass
 * cards — worth the extra depth. Everyday flat surfaces (list rows, plain
 * text) keep using the solid roles above; that's correct, not a gap.
 */
export interface AppPalette {
  /** Screen background. */
  background: string;
  /** Full-bleed hero background — a two-stop wash carrying `background`'s
   *  same hue toward true depth, for the handful of screens (landing,
   *  onboarding heroes) that earn a vignette instead of a flat fill. */
  backgroundGradient: [string, string];
  /** Raised card surface (highest-contrast against background). */
  surface: string;
  /** `surface`'s gradient form — a faint top-lit sheen for a card that
   *  should read as catching light (glass panels, hero CTAs' container). */
  surfaceGradient: [string, string];
  /** Secondary raised surface — tinted fields, tab bar, subtle sections. */
  surfaceMuted: string;
  /** Primary ink — headlines, body text, solid CTA fill. */
  ink: string;
  /** `ink`'s gradient form, for a solid `ink`-filled CTA that wants depth
   *  rather than a flat matte block (diagonal, lighter corner first). */
  inkGradient: [string, string];
  /** Text/icon color placed on top of an `ink`-filled CTA. */
  onInk: string;
  /** Secondary text. */
  inkMuted: string;
  /** Tertiary/placeholder text. */
  inkFaint: string;
  /** Hairline borders, dividers, unselected icon strokes. */
  outline: string;
  outlineVariant: string;
  /** Jewel-emerald accent — origin/live markers, ratings, success states. */
  accent: string;
  accentStrong: string;
  /** `accent`'s gradient form — the jewel-tone catching light, diagonal
   *  (lighter corner first), for accent-filled CTAs and badges. */
  accentGradient: [string, string];
  accentGlow: string;
  /** Text placed on top of an `accent`-filled chip/badge. */
  onAccent: string;
  /** Translucent highlight for a diagonal sheen swept across a card or
   *  button — the detail that turns a flat gradient fill into something
   *  that reads as catching real light. Composite it as a thin diagonal
   *  band near the top edge, not a full overlay. */
  glimmer: string;
  error: string;
  errorMuted: string;
  /** Tertiary "used elsewhere in the flow but not accent/error" moments,
   *  like the results list's "Best Match" label. Not for CTAs. */
  info: string;
  /** Pending/awaiting-response states (a booking request not yet answered,
   *  a ride not yet confirmed) — a third semantic tone alongside accent
   *  (confirmed/success) and error (cancelled/destructive), added for the
   *  2026-08-23 notifications/trips redesign once "pending" needed its own
   *  real token instead of borrowing inkMuted or accent. A warm amber/gold,
   *  deliberately distinct from both the emerald accent and the rust error
   *  hue. */
  warning: string;
  warningMuted: string;
}

export const lightPalette: AppPalette = {
  background: '#FFFFFF',
  backgroundGradient: ['#FFFFFF', '#EEF4FC'],
  surface: '#FFFFFF',
  surfaceGradient: ['#FFFFFF', '#EAF1FC'],
  // The palette's "secondary" surface — filter pills, tinted fields, badge
  // fills, avatar-fallback circles — is now a clean light blue (matching
  // the Stitch reference's own surface-container token) instead of the
  // old warm tan, on direct feedback.
  surfaceMuted: '#E4EDFB',
  ink: '#14201B',
  inkGradient: ['#1E2F27', '#0A100D'],
  onInk: '#FFFFFF',
  inkMuted: '#5B6572',
  inkFaint: '#8B93A3',
  outline: '#D3E1F5',
  outlineVariant: '#E4EDFB',
  accent: '#2E9E6C',
  accentStrong: '#22794F',
  accentGradient: ['#3FBE85', '#1F6B49'],
  accentGlow: '#8FD9B4',
  onAccent: '#0D1512',
  glimmer: 'rgba(255,255,255,0.55)',
  error: '#B5503C',
  errorMuted: '#F3D9CE',
  info: '#4A7C8C',
  warning: '#B58A2E',
  warningMuted: '#F3E8CE',
};

export const darkPalette: AppPalette = {
  background: '#0D1512',
  backgroundGradient: ['#182620', '#08100C'],
  surface: '#16211C',
  surfaceGradient: ['#20302A', '#131E19'],
  surfaceMuted: '#20302A',
  ink: '#F6F1E7',
  inkGradient: ['#FFFFFF', '#EEE2C4'],
  onInk: '#0D1512',
  inkMuted: '#B4AFA0',
  inkFaint: '#7C7A6E',
  outline: '#2A362F',
  outlineVariant: '#20302A',
  accent: '#3FBE85',
  accentStrong: '#2E9E6C',
  accentGradient: ['#63E8A9', '#279768'],
  accentGlow: '#1F6B49',
  onAccent: '#0D1512',
  glimmer: 'rgba(255,255,255,0.16)',
  error: '#E08672',
  errorMuted: '#5C2E24',
  info: '#8FB8C7',
  warning: '#E0BB72',
  warningMuted: '#5C4A24',
};

export type ColorScheme = 'light' | 'dark';
