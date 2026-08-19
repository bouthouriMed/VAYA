import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    alias: {
      react: path.resolve(__dirname, './node_modules/react'),
      'react-native': path.resolve(__dirname, './src/__mocks__/react-native.ts'),
      'expo-haptics': path.resolve(__dirname, './src/__mocks__/expo-haptics.ts'),
      '@expo/vector-icons': path.resolve(__dirname, './src/__mocks__/expo-vector-icons.ts'),
      'react-native-maps': path.resolve(__dirname, './src/__mocks__/react-native-maps.ts'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  },
});
