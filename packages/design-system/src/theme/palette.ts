/**
 * App theme palette, consumed via `AppThemeProvider`/`useAppTheme()`.
 *
 * A deliberate, from-scratch design pass — not a remap of an existing
 * token set. The brief: make VAYA read as genuinely premium in both light
 * and dark, not "basic black and white with a green accent." The concept:
 * deep charcoal-emerald darkness meets warm ivory light, unified by one
 * saturated jewel-tone emerald accent (not a muted "eco-app sage" — a
 * confident gem-green with real presence). Both modes lean warm rather
 * than clinical: `ink`/`background` are never flat `#000000`/`#FFFFFF` in
 * either mode.
 *
 * The two modes are built to mirror each other rather than simply invert:
 * dark mode's `background` (`#0D1512`) and light mode's `ink` (`#14201B`)
 * sit in the same deep charcoal-forest family, and light mode's
 * `background` (warm ivory) is close to dark mode's `ink` (warm
 * champagne). That relationship — not just "swap every value" — is what
 * makes a two-theme system read as one considered design instead of an
 * automated inversion.
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
}

export const lightPalette: AppPalette = {
  background: '#F7F3E8',
  backgroundGradient: ['#FBF8EF', '#F0E9D3'],
  surface: '#FFFFFF',
  surfaceGradient: ['#FFFFFF', '#F5EFDD'],
  surfaceMuted: '#EDE6D4',
  ink: '#14201B',
  inkGradient: ['#1E2F27', '#0A100D'],
  onInk: '#F7F3E8',
  inkMuted: '#5C5748',
  inkFaint: '#8C8674',
  outline: '#DDD4BC',
  outlineVariant: '#EDE6D4',
  accent: '#2E9E6C',
  accentStrong: '#22794F',
  accentGradient: ['#3FBE85', '#1F6B49'],
  accentGlow: '#8FD9B4',
  onAccent: '#0D1512',
  glimmer: 'rgba(255,255,255,0.55)',
  error: '#B5503C',
  errorMuted: '#F3D9CE',
  info: '#4A7C8C',
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
};

export type ColorScheme = 'light' | 'dark';
