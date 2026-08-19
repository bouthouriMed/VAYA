import { describe, it, expect } from 'vitest';
import { shouldResuggestAfterDismissal } from '../should-resuggest-after-dismissal';
import { DEFAULT_RECURRING_DETECTION_CONFIG } from '../default-recurring-detection-config';

const config = {
  dismissalRequiredConfidenceDelta: DEFAULT_RECURRING_DETECTION_CONFIG.dismissalRequiredConfidenceDelta,
};

describe('shouldResuggestAfterDismissal', () => {
  it('refuses to resurrect when the new confidence is about the same as at dismissal', () => {
    expect(shouldResuggestAfterDismissal(0.5, 0.5, config)).toBe(false);
    expect(shouldResuggestAfterDismissal(0.5, 0.55, config)).toBe(false);
  });

  it('refuses to resurrect when the new confidence is actually lower', () => {
    expect(shouldResuggestAfterDismissal(0.5, 0.3, config)).toBe(false);
  });

  it('allows resurrection once the delta is met or exceeded (materially stronger evidence)', () => {
    expect(shouldResuggestAfterDismissal(0.5, 0.65, config)).toBe(true);
    expect(shouldResuggestAfterDismissal(0.5, 0.8, config)).toBe(true);
  });
});
