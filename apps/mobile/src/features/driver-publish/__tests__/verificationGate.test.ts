import { describe, it, expect } from 'vitest';
import { isVerifiedDriver } from '../verificationGate';

describe('isVerifiedDriver', () => {
  it('is true only for an approved profile', () => {
    expect(isVerifiedDriver({ verificationStatus: 'approved' })).toBe(true);
  });

  it('is false for a pending or rejected profile', () => {
    expect(isVerifiedDriver({ verificationStatus: 'pending' })).toBe(false);
    expect(isVerifiedDriver({ verificationStatus: 'rejected' })).toBe(false);
  });

  it('is false when there is no driver profile at all', () => {
    expect(isVerifiedDriver(null)).toBe(false);
    expect(isVerifiedDriver(undefined)).toBe(false);
  });
});
