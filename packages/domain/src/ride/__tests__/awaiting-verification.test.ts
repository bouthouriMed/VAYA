import { describe, expect, it } from 'vitest';
import { canRideAwaitVerification, resolveAwaitingRideOnApproval } from '../awaiting-verification';

describe('canRideAwaitVerification', () => {
  it('allows a ride to wait while the driver is still in the review loop', () => {
    expect(canRideAwaitVerification('pending')).toBe(true);
    expect(canRideAwaitVerification('under_review')).toBe(true);
    expect(canRideAwaitVerification('resubmission_required')).toBe(true);
  });

  it('refuses for a rejected driver (terminal) and for an approved one (publishes directly)', () => {
    expect(canRideAwaitVerification('rejected')).toBe(false);
    expect(canRideAwaitVerification('approved')).toBe(false);
  });
});

describe('resolveAwaitingRideOnApproval', () => {
  const now = new Date('2026-10-07T10:00:00Z');

  it('publishes a ride whose departure is still ahead', () => {
    expect(resolveAwaitingRideOnApproval(new Date('2026-10-08T08:00:00Z'), now)).toBe('publish');
  });

  it('expires a ride whose departure already passed', () => {
    expect(resolveAwaitingRideOnApproval(new Date('2026-10-07T09:00:00Z'), now)).toBe('expire');
    expect(resolveAwaitingRideOnApproval(now, now)).toBe('expire');
  });
});
