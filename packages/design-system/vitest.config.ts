import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // The barrel-import smoke tests transform the whole primitive tree; under
    // turbo's parallel workers (mobile+api suites running alongside) that can
    // take tens of seconds on slower machines even though the same file runs
    // in ~3s standalone. Assertion semantics unchanged.
    testTimeout: 60_000,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    alias: {
      react: path.resolve(__dirname, './node_modules/react'),
      'react-native': path.resolve(__dirname, './src/__mocks__/react-native.ts'),
      'expo-haptics': path.resolve(__dirname, './src/__mocks__/expo-haptics.ts'),
      'expo-constants': path.resolve(__dirname, './src/__mocks__/expo-constants.ts'),
      '@expo/vector-icons': path.resolve(__dirname, './src/__mocks__/expo-vector-icons.ts'),
      'react-native-maps': path.resolve(__dirname, './src/__mocks__/react-native-maps.ts'),
      'expo-blur': path.resolve(__dirname, './src/__mocks__/expo-blur.ts'),
      'expo-linear-gradient': path.resolve(__dirname, './src/__mocks__/expo-linear-gradient.ts'),
      'react-native-svg': path.resolve(__dirname, './src/__mocks__/react-native-svg.ts'),
      'react-native-gesture-handler': path.resolve(__dirname, './src/__mocks__/react-native-gesture-handler.ts'),
      'react-native-reanimated': path.resolve(__dirname, './src/__mocks__/react-native-reanimated.ts'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  },
});
