/**
 * App theme palette, consumed via `AppThemeProvider`/`useAppTheme()`.
 *
 * Originally pulled directly from the "Vaya Passenger Journey UX" Stitch
 * export — a generic Material-3 black/white/emerald-mint scheme. That read
 * as exactly the "generic Material default" CLAUDE.md's design-system
 * rules warn against, and diluted the one thing `tokens/colors.ts`'s warm
 * navy/sage/cream palette already had going for it: a distinctive,
 * non-generic identity ("the strongest, most distinctive asset in the
 * current product"). Every role below is now derived from that same
 * existing palette instead — `ink`/`onInk`/`background` are never flat
 * `#000000`/`#FFFFFF`, and `accent` is VAYA's actual sage rather than a
 * Material emerald — so a screen on `useAppTheme()` and a screen still on
 * the static `colors` tokens read as one coherent brand instead of two
 * different apps stitched together, in both light and dark.
 *
 * `dark` is not a separate invention: it reuses `tokens/colors.ts`'s own
 * navy family (`primary`/`primaryLight`/`primaryDark`, already used
 * elsewhere in the app as a deliberate dark-hero surface — see
 * `driver/onboarding/index.tsx`) as the background/surface steps, and the
 * same sage/cream tones as light mode's, just redistributed across roles.
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
  /** Sage accent — origin/live markers, ratings, success states. */
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
  background: '#F3F1E9',
  surface: '#FFFFFF',
  surfaceMuted: '#EAE7DC',
  ink: '#1C2429',
  onInk: '#FAF8F2',
  inkMuted: '#57616A',
  inkFaint: '#9B9788',
  outline: '#DDD9CA',
  outlineVariant: '#EAE7DC',
  accent: '#7FA491',
  accentStrong: '#587566',
  accentGlow: '#A8C4B6',
  onAccent: '#1C2429',
  error: '#A65C4E',
  errorMuted: '#CE9787',
  info: '#5B7D8A',
};

export const darkPalette: AppPalette = {
  background: '#1C2429',
  surface: '#2E3B42',
  surfaceMuted: '#4B5960',
  ink: '#F3F1E9',
  onInk: '#1C2429',
  inkMuted: '#BDB9A9',
  inkFaint: '#9B9788',
  outline: '#3A4750',
  outlineVariant: '#4B5960',
  accent: '#A8C4B6',
  accentStrong: '#7FA491',
  accentGlow: '#7FA491',
  onAccent: '#1C2429',
  error: '#CE9787',
  errorMuted: '#733D33',
  info: '#9DBAC3',
};

export type ColorScheme = 'light' | 'dark';
