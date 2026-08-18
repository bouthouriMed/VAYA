/**
 * ARC visual direction: sage-green brand, warm cream neutrals, dark-navy ink.
 * Derived from the product mockups (apps/mobile/assets/UI_UX Design *.jfif).
 */
export const colors = {
  // Brand — sage green
  primary: '#4B6B4E',
  primaryLight: '#7E9E7C',
  primaryDark: '#2E4429',

  // Accent — warm amber (pending states, secondary CTAs)
  secondary: '#C99A4E',
  secondaryLight: '#E0B876',
  secondaryDark: '#8A6423',

  // Neutrals — warm cream → dark navy-ink scale
  white: '#FFFFFF',
  black: '#000000',
  gray50: '#FAF8F3',
  gray100: '#F5F1E6',
  gray200: '#EBE6D6',
  gray300: '#DCD5C2',
  gray400: '#B8B29C',
  gray500: '#8F8A76',
  gray600: '#6C766A',
  gray700: '#4A5348',
  gray800: '#2C362E',
  gray900: '#1B2721',

  // Semantic
  success: '#5C8A5F',
  successLight: '#A9C7A8',
  successDark: '#3A5C3D',

  warning: '#C99A4E',
  warningLight: '#E0B876',
  warningDark: '#8A6423',

  error: '#B5594A',
  errorLight: '#D68A7D',
  errorDark: '#7C3A2E',

  info: '#4C8079',
  infoLight: '#8FB5AF',
  infoDark: '#2F5A52',

  // Dark navy surfaces (splash, dark cards, status backgrounds)
  navySurface: '#12201B',
  navySurfaceElevated: '#1E3A2E',
  navyText: '#F5F1E6',
  navyTextMuted: '#93A696',

  // Map tokens
  mapRouteLine: '#4B6B4E',
  mapRouteLineFaint: 'rgba(75, 107, 78, 0.3)',
  mapUserMarker: '#7E9E7C',
  mapDriverMarker: '#1B2721',
  mapPickupMarker: '#C99A4E',
  mapCorridorFill: 'rgba(75, 107, 78, 0.13)',
  mapTileTint: '#EBE6D6',

  // Trust / reliability tokens
  trustBarFill: '#4B6B4E',
  trustBarTrack: '#EBE6D6',
  ratingStar: '#C99A4E',
} as const;

export type ColorToken = keyof typeof colors;
