import { describe, it, expect } from 'vitest';
import { verificationDeclineReasonKey } from '../verificationDeclineCopy';
import type { VerificationDeclineReason } from '../../../state/api';

describe('verificationDeclineReasonKey', () => {
  const reasons: VerificationDeclineReason[] = [
    'document_unclear',
    'expired',
    'information_mismatch',
    'missing_document',
    'invalid_document',
    'additional_info_required',
    'other',
  ];

  it('maps every structured decline reason to a distinct i18n key', () => {
    const keys = reasons.map(verificationDeclineReasonKey);
    expect(new Set(keys).size).toBe(reasons.length);
    keys.forEach((key) => expect(key).toMatch(/^onboarding\.verificationReasons\./));
  });
});
