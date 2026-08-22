import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import noNonWorkletCallsInGestureCallbacks from './rules/no-non-worklet-calls-in-gesture-callbacks.js';

const vayaPlugin = {
  rules: {
    'no-non-worklet-calls-in-gesture-callbacks': noNonWorkletCallsInGestureCallbacks,
  },
};

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      vaya: vayaPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      // The worklet rule needs the real gesture-handler/reanimated method
      // names to exist as identifiers — it is purely syntactic, so no extra
      // globals are required; this block stays parser-only.
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // UI-thread/worklet contract — see the rule header for why this is an
      // error and not a warning (silent process death on iOS, untestable via
      // unit/snapshot suites).
      'vaya/no-non-worklet-calls-in-gesture-callbacks': 'error',
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/.turbo/**'],
  },
];
