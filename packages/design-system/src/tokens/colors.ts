/**
 * ARC visual direction: restrained 3-tone palette — warm cream surface,
 * dark slate-navy ink (also the solid CTA/header color), muted sage accent.
 * Derived from the product mockups (apps/mobile/assets/UI_UX Design *.jfif).
 */
export const colors = {
  // Brand — dark slate-navy (solid CTAs, headers, primary text)
  primary: '#2E3B42',
  primaryLight: '#4B5960',
  primaryDark: '#1C2429',

  // Accent — muted sage (route lines, dots, meter fill, stars)
  secondary: '#7FA491',
  secondaryLight: '#A8C4B6',
  secondaryDark: '#587566',

  // Neutrals — warm cream → dark ink scale
  white: '#FFFFFF',
  black: '#000000',
  gray50: '#FAF8F2',
  gray100: '#F3F1E9',
  gray200: '#EAE7DC',
  gray300: '#DDD9CA',
  gray400: '#BDB9A9',
  gray500: '#9B9788',
  gray600: '#7A8288',
  gray700: '#57616A',
  gray800: '#3A444C',
  gray900: '#26333A',

  // Semantic
  success: '#587566',
  successLight: '#A8C4B6',
  successDark: '#3B5347',

  warning: '#B08A4E',
  warningLight: '#D6BC8C',
  warningDark: '#7A5C30',

  error: '#A65C4E',
  errorLight: '#CE9787',
  errorDark: '#733D33',

  info: '#5B7D8A',
  infoLight: '#9DBAC3',
  infoDark: '#3B535D',

  // Dark hero surfaces (arrival/settlement header block, splash)
  navySurface: '#2E3B42',
  navySurfaceElevated: '#3A4750',
  navyText: '#F3F1E9',
  navyTextMuted: '#AEB6B9',

  // Map tokens
  mapRouteLine: '#7FA491',
  mapRouteLineFaint: 'rgba(127, 164, 145, 0.3)',
  mapUserMarker: '#7FA491',
  mapDriverMarker: '#2E3B42',
  mapPickupMarker: '#2E3B42',
  mapCorridorFill: 'rgba(127, 164, 145, 0.14)',
  mapTileTint: '#EDEBE1',

  // Trust / reliability tokens
  trustBarFill: '#7FA491',
  trustBarTrack: '#E2E8E4',
  ratingStar: '#7FA491',
} as const;

export type ColorToken = keyof typeof colors;
