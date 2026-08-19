import { useEffect, useRef, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useAppSelector } from '../../state/store';
import { useListMyRecurringPatternsQuery, useUpdateRecurringPatternMutation } from '../../state/api';
import { trackEvent } from '../../services/analytics/analytics';
import { RecurringPatternPromptSheet } from './RecurringPatternPromptSheet';

/**
 * Global proactive-prompt mechanism for Phase 11
 * (docs/roadmap/phase-11-recurring-rides.md's UX behavior: "Detection is
 * passive... the entry point must be a proactive suggestion based on real
 * behavior, not a form") — mounted once at the app root (app/_layout.tsx),
 * the same placement and "poll once per cold start" discipline
 * RatingPromptBridge (Phase 9) already established for this codebase's
 * thin analytics-stub-era constraints (no local-notification scheduling
 * infrastructure to hang a true reminder off of).
 *
 * Surfaces the first `suggested` pattern found in `GET /recurring-patterns`
 * as a bottom sheet. Dismissing sets it to `dismissed` (best-effort — the
 * detection job's `shouldResuggestAfterDismissal` rule governs whether it
 * ever comes back, not this bridge). Enabling transitions it to `enabled`
 * and — for a rider pattern — proactive matching takes over from here; for
 * a driver pattern, the pattern-management screen (`/recurring`) is where
 * the auto-draft confirmation flow is reached from.
 */
export function RecurringPatternPromptBridge(): React.JSX.Element | null {
  const isAuthenticated = useAppSelector((s) => Boolean(s.auth.accessToken));
  const { data: patterns } = useListMyRecurringPatternsQuery(isAuthenticated ? undefined : skipToken);
  const [updatePattern, { isLoading: isUpdating }] = useUpdateRecurringPatternMutation();
  const [dismissedThisSession, setDismissedThisSession] = useState<Set<string>>(new Set());
  const promptedPatternIds = useRef<Set<string>>(new Set());

  const suggested = (patterns ?? []).find(
    (p) => p.status === 'suggested' && !dismissedThisSession.has(p.id),
  );

  useEffect(() => {
    if (suggested && !promptedPatternIds.current.has(suggested.id)) {
      promptedPatternIds.current.add(suggested.id);
      trackEvent('recurring_pattern_detected', { patternId: suggested.id, role: suggested.role });
    }
  }, [suggested]);

  if (!suggested) return null;

  return (
    <RecurringPatternPromptSheet
      visible
      pattern={suggested}
      enabling={isUpdating}
      onClose={() => {
        setDismissedThisSession((prev) => new Set(prev).add(suggested.id));
        void updatePattern({ patternId: suggested.id, input: { action: 'dismiss' } })
          .unwrap()
          .then(() => {
            trackEvent('recurring_pattern_dismissed', { patternId: suggested.id, role: suggested.role });
          })
          .catch(() => {
            // Best-effort: worst case the same suggestion re-appears next
            // cold start, which is acceptable (not nagging mid-session).
          });
      }}
      onEnable={() => {
        void updatePattern({ patternId: suggested.id, input: { action: 'enable' } })
          .unwrap()
          .then(() => {
            trackEvent('recurring_pattern_enabled', { patternId: suggested.id, role: suggested.role });
            setDismissedThisSession((prev) => new Set(prev).add(suggested.id));
          })
          .catch(() => {
            // Left un-dismissed so the sheet stays visible and the user can
            // retry — never silently swallow a failed enable.
          });
      }}
    />
  );
}
