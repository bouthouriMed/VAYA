// Real SafeAreaProvider measures actual device insets natively — not
// resolvable under Vitest. Screens under test only read the hook, they
// don't need a working <SafeAreaProvider> ancestor.
export function useSafeAreaInsets(): { top: number; bottom: number; left: number; right: number } {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

export const SafeAreaProvider = 'SafeAreaProvider';
export const SafeAreaView = 'SafeAreaView';
