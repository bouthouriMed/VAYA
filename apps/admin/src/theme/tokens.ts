/**
 * VAYA brand palette, hand-copied (not imported) from
 * packages/design-system/src/tokens/colors.ts — that package is React
 * Native (react-native-maps, etc.) and would break a Vite web bundle if
 * imported directly. Keep these values in sync manually if the source
 * palette ever changes; this is the only place this admin app defines
 * color.
 */
export const colors = {
  primary: '#2E3B42',
  primaryLight: '#4B5960',
  primaryDark: '#1C2429',

  secondary: '#7FA491',
  secondaryLight: '#A8C4B6',
  secondaryDark: '#587566',

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
} as const;

/** Below this demand/supply ratio a corridor row is flagged as
 *  meaningfully underserved — an arbitrary but documented threshold
 *  (supply covers less than a third of observed demand), not a
 *  server-computed value. Purely a UI highlight heuristic. */
export const UNDERSERVED_SUPPLY_RATIO = 1 / 3;
/** Below this absolute search volume, a corridor's demand/supply ratio is
 *  too noisy to flag as a real signal (e.g. 1 search vs 0 supply would
 *  otherwise always flag) — requires at least this many searches in the
 *  window before the "underserved" highlight applies. */
export const MIN_DEMAND_FOR_SIGNAL = 5;

export function isUnderservedCorridor(demand: number, supply: number): boolean {
  if (demand < MIN_DEMAND_FOR_SIGNAL) return false;
  return supply === 0 || supply / demand < UNDERSERVED_SUPPLY_RATIO;
}
