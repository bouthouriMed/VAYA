/**
 * VAYA marketing-site tokens — not a new palette. Mirrors the two real
 * token sources already shipping in the app (values copied, not
 * reinvented, since this package can't import react-native code into a
 * web bundle):
 *
 * - `darkPalette` values === packages/design-system/src/theme/palette.ts's
 *   `darkPalette` — the jewel-emerald identity the app's own real
 *   sign-in/onboarding/publish/landing screens already use, fixed-dark by
 *   deliberate brand choice regardless of system theme. The site adopts
 *   the same fixed-dark posture for the same reason: it's VAYA's actual
 *   current first-touch visual identity, not a marketing-only invention.
 * - `route` values === packages/design-system/src/tokens/colors.ts's
 *   map tokens (`mapRouteLine`, `mapPickupMarker` etc.) — the sage/navy
 *   pair the real app map uses for route polylines and stop pins. Used
 *   here specifically for the 3D road/route motif so it reads as the same
 *   visual language as the in-app map, not a decorative green.
 */
export const dark = {
  background: '#0D1512',
  backgroundGradientFrom: '#182620',
  backgroundGradientTo: '#08100C',
  surface: '#16211C',
  surfaceMuted: '#20302A',
  ink: '#F6F1E7',
  inkMuted: '#B4AFA0',
  inkFaint: '#7C7A6E',
  onInk: '#0D1512',
  outline: '#2A362F',
  outlineVariant: '#20302A',
  accent: '#3FBE85',
  accentStrong: '#2E9E6C',
  accentGlow: '#1F6B49',
  onAccent: '#0D1512',
  glimmer: 'rgba(255,255,255,0.16)',
  error: '#E08672',
  warning: '#E0BB72',
  info: '#8FB8C7',
} as const;

export const route = {
  line: '#7FA491',
  lineFaint: 'rgba(127, 164, 145, 0.3)',
  pickup: '#2E3B42',
  corridorFill: 'rgba(127, 164, 145, 0.14)',
} as const;

export const spacingPx = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

export const radiiPx = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  '3xl': 32,
  full: 9999,
} as const;
