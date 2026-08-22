import { describe, expect, it } from 'vitest';
import { describeVerificationSubmitError } from '../verificationErrors';

/**
 * The submit flow has exactly two failing stages (document uploads, then
 * profile creation) and a bounded set of transport/server failure shapes —
 * each maps to one honest message. The raw server strings must never leak
 * through (they are English developer text).
 */

describe('describeVerificationSubmitError', () => {
  it('network failure during uploads → connection guidance scoped to documents', () => {
    const info = describeVerificationSubmitError({ status: 'FETCH_ERROR' }, 'documents');
    expect(info.kind).toBe('offline');
    expect(info.message).toContain('documents');
    expect(info.message).toContain('connexion');
  });

  it('timeout during profile creation → connection guidance', () => {
    const info = describeVerificationSubmitError({ status: 'TIMEOUT_ERROR' }, 'profile');
    expect(info.kind).toBe('offline');
    expect(info.message).toContain('serveur');
  });

  it('expired session (401) → reconnection guidance', () => {
    expect(describeVerificationSubmitError({ status: 401 }, 'profile').kind).toBe('session');
    expect(
      describeVerificationSubmitError({ status: 401 }, 'profile').message,
    ).toContain('session');
  });

  it('server UNAUTHORIZED body without numeric status → session kind', () => {
    const info = describeVerificationSubmitError(
      { status: 500, data: { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } } },
      'documents',
    );
    expect(info.kind).toBe('session');
  });

  it('conflict → conflict kind with non-leaking copy', () => {
    const info = describeVerificationSubmitError(
      {
        status: 409,
        data: { error: { code: 'CONFLICT', message: 'Driver profile already exists for this user' } },
      },
      'profile',
    );
    expect(info.kind).toBe('conflict');
    // The English developer string must not surface to the user.
    expect(info.message).not.toContain('Driver profile');
    expect(info.message).not.toContain('already exists');
  });

  it('validation error → validation kind', () => {
    const info = describeVerificationSubmitError(
      { status: 400, data: { error: { code: 'VALIDATION_ERROR', message: 'Invalid body' } } },
      'profile',
    );
    expect(info.kind).toBe('validation');
    expect(info.message).not.toContain('Invalid body');
  });

  it('opaque server 500 at each stage → distinct honest retry messages', () => {
    const documents = describeVerificationSubmitError({ status: 500 }, 'documents');
    const profile = describeVerificationSubmitError({ status: 500 }, 'profile');
    expect(documents.kind).toBe('server');
    expect(profile.kind).toBe('server');
    expect(documents.message).toContain('documents');
    expect(profile.message).toContain('profil conducteur');
  });

  it('non-object throwables (throw new Error / string) → safe generic fallback', () => {
    expect(describeVerificationSubmitError(new Error('boom'), 'documents').kind).toBe('server');
    expect(describeVerificationSubmitError('weird', 'profile').kind).toBe('server');
    expect(describeVerificationSubmitError(undefined, 'profile').kind).toBe('server');
    expect(describeVerificationSubmitError(null, 'profile').kind).toBe('server');
  });
});
