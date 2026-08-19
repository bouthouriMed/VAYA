import { describe, it, expect } from 'vitest';
import {
  canTransitionRecurringPatternStatus,
  computeRecurringPatternStatus,
} from '../recurring-pattern-status';
import { DEFAULT_RECURRING_DETECTION_CONFIG } from '../default-recurring-detection-config';

describe('canTransitionRecurringPatternStatus', () => {
  it('allows detected -> suggested, enabled, or dismissed', () => {
    expect(canTransitionRecurringPatternStatus('detected', 'suggested')).toBe(true);
    expect(canTransitionRecurringPatternStatus('detected', 'enabled')).toBe(true);
    expect(canTransitionRecurringPatternStatus('detected', 'dismissed')).toBe(true);
  });

  it('allows suggested -> enabled or dismissed, but not back to detected', () => {
    expect(canTransitionRecurringPatternStatus('suggested', 'enabled')).toBe(true);
    expect(canTransitionRecurringPatternStatus('suggested', 'dismissed')).toBe(true);
    expect(canTransitionRecurringPatternStatus('suggested', 'detected')).toBe(false);
  });

  it('allows enabled -> dismissed only (disabling a pattern)', () => {
    expect(canTransitionRecurringPatternStatus('enabled', 'dismissed')).toBe(true);
    expect(canTransitionRecurringPatternStatus('enabled', 'suggested')).toBe(false);
    expect(canTransitionRecurringPatternStatus('enabled', 'detected')).toBe(false);
  });

  it('never allows a direct transition out of dismissed via the user-facing state machine', () => {
    expect(canTransitionRecurringPatternStatus('dismissed', 'detected')).toBe(false);
    expect(canTransitionRecurringPatternStatus('dismissed', 'suggested')).toBe(false);
    expect(canTransitionRecurringPatternStatus('dismissed', 'enabled')).toBe(false);
  });
});

describe('computeRecurringPatternStatus', () => {
  const config = { suggestedConfidenceThreshold: DEFAULT_RECURRING_DETECTION_CONFIG.suggestedConfidenceThreshold };

  it('returns suggested at or above the threshold', () => {
    expect(computeRecurringPatternStatus(0.6, config)).toBe('suggested');
    expect(computeRecurringPatternStatus(0.9, config)).toBe('suggested');
  });

  it('returns detected below the threshold', () => {
    expect(computeRecurringPatternStatus(0.59, config)).toBe('detected');
    expect(computeRecurringPatternStatus(0, config)).toBe('detected');
  });
});
