import { defineConfig } from 'vitest/config';
import path from 'path';

// '@vaya/design-system' resolves to its TS source (package.json's
// `main: src/index.ts`), and that barrel eagerly imports every primitive —
// so any screen test that touches the design system needs the same native
// module stand-ins the design-system package itself uses for its own
// tests. Reused directly from there (not duplicated) so the two can't drift.
const designSystemMocks = path.resolve(__dirname, '../../packages/design-system/src/__mocks__');

export default defineConfig({
  // Screens rely on the automatic JSX runtime (tsconfig's "jsx": "react-jsx",
  // applied for real by Expo's babel preset) and don't import React
  // themselves — Vite/esbuild's own default is the classic transform, which
  // would leave `React` undefined at render time.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'node',
    // The screen-rendering snapshot tests transform a much bigger module
    // graph (whole screens + the design-system barrel) than this package's
    // previous logic-only tests; on a colder cache that can exceed
    // vitest's 5s default (same reasoning as design-system's own
    // vitest.config.ts). Assertion semantics unchanged.
    testTimeout: 60_000,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    alias: {
      react: path.resolve(__dirname, './node_modules/react'),
      'react-native': path.resolve(designSystemMocks, 'react-native.ts'),
      'expo-haptics': path.resolve(designSystemMocks, 'expo-haptics.ts'),
      'expo-constants': path.resolve(designSystemMocks, 'expo-constants.ts'),
      '@expo/vector-icons': path.resolve(designSystemMocks, 'expo-vector-icons.ts'),
      'react-native-maps': path.resolve(designSystemMocks, 'react-native-maps.ts'),
      'expo-blur': path.resolve(designSystemMocks, 'expo-blur.ts'),
      'expo-linear-gradient': path.resolve(designSystemMocks, 'expo-linear-gradient.ts'),
      'react-native-svg': path.resolve(designSystemMocks, 'react-native-svg.ts'),
      'react-native-gesture-handler': path.resolve(designSystemMocks, 'react-native-gesture-handler.ts'),
      'react-native-reanimated': path.resolve(designSystemMocks, 'react-native-reanimated.ts'),
      'react-native-safe-area-context': path.resolve(
        __dirname,
        './src/__mocks__/react-native-safe-area-context.ts',
      ),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  },
});
