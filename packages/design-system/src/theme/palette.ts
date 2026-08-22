/**
 * App theme palette, consumed via `AppThemeProvider`/`useAppTheme()`.
 *
 * Pulled directly from the "Vaya Passenger Journey UX" Stitch reference
 * (Search Ride / Ride Results Refined / Route Map / Driver Profile /
 * Driver Reviews / Request Sent / Ride Confirmed) — a cool lavender-white +
 * near-black + emerald-mint scheme. This supersedes `tokens/colors`' warm
 * cream/navy/sage direction as the live design target; screens not yet
 * migrated to `useAppTheme()` keep reading the old `colors` token unchanged
 * until they're brought over.
 *
 * `dark` is a derived counterpart, not part of the original mockups (which
 * were light-only): it reuses the *other*, already-dark-toned roles
 * Stitch's own Material-3-generated scheme included (a real M3 export
 * always carries tokens for inverse/fixed surfaces — e.g. its
 * `primary-container`/`on-background` values are already near-black), so
 * light and dark stay two ends of one coherent system instead of an
 * unrelated invention.
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
  /** Emerald-mint accent — origin/live markers, ratings, success states. */
  accent: string;
  accentStrong: string;
  accentGlow: string;
  /** Text placed on top of an `accent`-filled chip/badge. */
  onAccent: string;
  error: string;
  errorMuted: string;
  /** Tertiary blue (Stitch design-md's `tertiary_fixed`/`on_tertiary_fixed_variant`)
   *  — sparingly, for "used elsewhere in the flow but not accent/error"
   *  moments like the results list's "Best Match" label. Not for CTAs. */
  info: string;
}

export const lightPalette: AppPalette = {
  background: '#F8F9FF',
  surface: '#FFFFFF',
  surfaceMuted: '#E5EEFF',
  ink: '#000000',
  onInk: '#FFFFFF',
  inkMuted: '#45464D',
  inkFaint: '#76777D',
  outline: '#C6C6CD',
  outlineVariant: '#DAE2FD',
  accent: '#006C49',
  accentStrong: '#00714D',
  accentGlow: '#6FFBBE',
  onAccent: '#FFFFFF',
  error: '#BA1A1A',
  errorMuted: '#FFDAD6',
  info: '#3980F4',
};

export const darkPalette: AppPalette = {
  background: '#0B1220',
  surface: '#131B2E',
  surfaceMuted: '#1B2540',
  ink: '#F8F9FF',
  onInk: '#0B1220',
  inkMuted: '#BEC6E0',
  inkFaint: '#7C839B',
  outline: '#3F465C',
  outlineVariant: '#213145',
  accent: '#4EDEA3',
  accentStrong: '#6FFBBE',
  accentGlow: '#00714D',
  onAccent: '#0B1220',
  error: '#FFB4AB',
  errorMuted: '#93000A',
  info: '#ADC6FF',
};

export type ColorScheme = 'light' | 'dark';
