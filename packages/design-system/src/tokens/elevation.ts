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

export const elevation = Platform.select<PlatformElevation>({
  ios: {
    none: {
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
    },
    sm: {
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.18,
      shadowRadius: 1.0,
    },
    md: {
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 3.0,
    },
    lg: {
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius: 5.0,
    },
    xl: {
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 10.0,
    },
  },
  android: {
    none: { elevation: 0 },
    sm: { elevation: 2 },
    md: { elevation: 4 },
    lg: { elevation: 8 },
    xl: { elevation: 16 },
  },
  default: {
    none: { elevation: 0 },
    sm: { elevation: 2 },
    md: { elevation: 4 },
    lg: { elevation: 8 },
    xl: { elevation: 16 },
  },
});

export type ElevationLevel = 'none' | 'sm' | 'md' | 'lg' | 'xl';
