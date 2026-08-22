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
 */
export interface AppPalette {
  /** Screen background. */
  background: string;
  /** Raised card surface (highest-contrast against background). */
  surface: string;
  /** Secondary raised surface — tinted fields, tab bar, subtle sections. */
  surfaceMuted: string;
  /** Primary ink — headlines, body text, solid CTA fill. */
  ink: string;
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
  accentGlow: string;
  /** Text placed on top of an `accent`-filled chip/badge. */
  onAccent: string;
  error: string;
  errorMuted: string;
  /** Tertiary "used elsewhere in the flow but not accent/error" moments,
   *  like the results list's "Best Match" label. Not for CTAs. */
  info: string;
}

export const lightPalette: AppPalette = {
  background: '#F7F3E8',
  surface: '#FFFFFF',
  surfaceMuted: '#EDE6D4',
  ink: '#14201B',
  onInk: '#F7F3E8',
  inkMuted: '#5C5748',
  inkFaint: '#8C8674',
  outline: '#DDD4BC',
  outlineVariant: '#EDE6D4',
  accent: '#2E9E6C',
  accentStrong: '#22794F',
  accentGlow: '#8FD9B4',
  onAccent: '#0D1512',
  error: '#B5503C',
  errorMuted: '#F3D9CE',
  info: '#4A7C8C',
};

export const darkPalette: AppPalette = {
  background: '#0D1512',
  surface: '#16211C',
  surfaceMuted: '#20302A',
  ink: '#F6F1E7',
  onInk: '#0D1512',
  inkMuted: '#B4AFA0',
  inkFaint: '#7C7A6E',
  outline: '#2A362F',
  outlineVariant: '#20302A',
  accent: '#3FBE85',
  accentStrong: '#2E9E6C',
  accentGlow: '#1F6B49',
  onAccent: '#0D1512',
  error: '#E08672',
  errorMuted: '#5C2E24',
  info: '#8FB8C7',
};

export type ColorScheme = 'light' | 'dark';
