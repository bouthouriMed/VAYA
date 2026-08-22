import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { lightPalette, darkPalette, type AppPalette, type ColorScheme } from './palette';

interface AppThemeValue {
  colors: AppPalette;
  scheme: ColorScheme;
}

const AppThemeContext = createContext<AppThemeValue>({
  colors: lightPalette,
  scheme: 'light',
});

interface AppThemeProviderProps {
  children: React.ReactNode;
  /** Force a scheme instead of following the device setting (rare — mainly
   *  for a screen that must render a single scheme regardless of system). */
  scheme?: ColorScheme;
}

/**
 * The app's one theme provider — mount once at the root (`app/_layout.tsx`),
 * not per-screen or per-flow. Follows the device's light/dark setting by
 * default via `useColorScheme()`.
 */
export function AppThemeProvider({ children, scheme }: AppThemeProviderProps): React.JSX.Element {
  const systemScheme = useColorScheme();
  const resolved: ColorScheme = scheme ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const value = useMemo<AppThemeValue>(
    () => ({ colors: resolved === 'dark' ? darkPalette : lightPalette, scheme: resolved }),
    [resolved],
  );
  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeValue {
  return useContext(AppThemeContext);
}
