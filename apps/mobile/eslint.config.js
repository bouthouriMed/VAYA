import config from '@vaya/eslint-config';

/**
 * Mobile-only guardrails that keep the UI on one source of truth
 * (docs/design-system/README.md, "Source of truth"):
 * - Dates and times are formatted only through src/utils/localeFormat.ts, so
 *   every clock time is 24-hour and every date uses the same locale tags.
 * - Screens and features read colors from `useAppTheme()`, never the legacy
 *   static `colors` tokens, so every screen follows light/dark mode.
 */
const restrictedSyntax = [
  {
    selector: "CallExpression[callee.property.name=/^toLocale(Time|Date)String$/]",
    message: 'Format dates/times with src/utils/localeFormat.ts (formatClock, formatShortDate, formatDate).',
  },
];

export default [
  ...config,
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['**/__tests__/**', 'src/utils/localeFormat.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedSyntax],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@vaya/design-system',
              importNames: ['colors'],
              message:
                'Use useAppTheme() colors. The static `colors` tokens ignore dark mode; map-only tokens belong inside design-system map primitives.',
            },
          ],
        },
      ],
    },
  },
];
