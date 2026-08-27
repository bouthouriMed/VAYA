import { describe, it, expect } from 'vitest';
import { canTransitionVerificationStatus } from '../verification-transitions';

describe('canTransitionVerificationStatus', () => {
  it('allows an admin to move pending into every review outcome', () => {
    expect(canTransitionVerificationStatus('pending', 'under_review')).toBe(true);
    expect(canTransitionVerificationStatus('pending', 'approved')).toBe(true);
    expect(canTransitionVerificationStatus('pending', 'rejected')).toBe(true);
    expect(canTransitionVerificationStatus('pending', 'resubmission_required')).toBe(true);
  });

  it('lets a resubmission_required driver only go back to pending', () => {
    expect(canTransitionVerificationStatus('resubmission_required', 'pending')).toBe(true);
    expect(canTransitionVerificationStatus('resubmission_required', 'approved')).toBe(false);
  });

  it('treats approved and rejected as terminal', () => {
    expect(canTransitionVerificationStatus('approved', 'pending')).toBe(false);
    expect(canTransitionVerificationStatus('approved', 'under_review')).toBe(false);
    expect(canTransitionVerificationStatus('rejected', 'pending')).toBe(false);
    expect(canTransitionVerificationStatus('rejected', 'resubmission_required')).toBe(false);
  });
});
