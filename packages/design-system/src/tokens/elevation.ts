import { Platform } from 'react-native';

interface ShadowStyle {
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
}

interface ElevationStyle {
  elevation: number;
}

type PlatformElevation = Record<string, ShadowStyle | ElevationStyle>;

// Calibrated to match Card's original hand-tuned shadow (the brand's soft,
// low-contrast aesthetic) rather than Material-default opacity/radius —
// `md` here is deliberately identical to Card's pre-token values so
// adopting the token doesn't change Card's appearance, and every other
// shadow-using primitive (Modal, BottomSheet, Toast) now shares this scale
// instead of hand-rolling its own.
export const elevation = Platform.select<PlatformElevation>({
  ios: {
    none: {
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
    },
    sm: {
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
    },
    md: {
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 14,
    },
    lg: {
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 20,
    },
    xl: {
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.1,
      shadowRadius: 28,
    },
  },
  android: {
    none: { elevation: 0 },
    sm: { elevation: 1 },
    md: { elevation: 2 },
    lg: { elevation: 4 },
    xl: { elevation: 8 },
  },
  default: {
    none: { elevation: 0 },
    sm: { elevation: 1 },
    md: { elevation: 2 },
    lg: { elevation: 4 },
    xl: { elevation: 8 },
  },
});

export type ElevationLevel = 'none' | 'sm' | 'md' | 'lg' | 'xl';
