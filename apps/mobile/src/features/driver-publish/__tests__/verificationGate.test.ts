import { describe, it, expect } from 'vitest';
import { canBuildRide, isAwaitingVerification, isVerifiedDriver } from '../verificationGate';

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

describe('canBuildRide', () => {
  it('lets approved drivers and drivers still under review build a ride', () => {
    expect(canBuildRide({ verificationStatus: 'approved' })).toBe(true);
    expect(canBuildRide({ verificationStatus: 'pending' })).toBe(true);
    expect(canBuildRide({ verificationStatus: 'under_review' })).toBe(true);
    expect(canBuildRide({ verificationStatus: 'resubmission_required' })).toBe(true);
  });

  it('stops a rejected driver and someone who never onboarded', () => {
    expect(canBuildRide({ verificationStatus: 'rejected' })).toBe(false);
    expect(canBuildRide(null)).toBe(false);
    expect(canBuildRide(undefined)).toBe(false);
  });
});

describe('isAwaitingVerification', () => {
  it('is true only for a flagged draft', () => {
    expect(isAwaitingVerification({ status: 'draft', publishOnVerificationAt: '2026-10-07T10:00:00Z' })).toBe(true);
    expect(isAwaitingVerification({ status: 'draft', publishOnVerificationAt: null })).toBe(false);
    expect(isAwaitingVerification({ status: 'published', publishOnVerificationAt: null })).toBe(false);
  });
});
