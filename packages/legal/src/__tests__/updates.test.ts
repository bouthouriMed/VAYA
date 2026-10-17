import { describe, it, expect } from 'vitest';
import { LEGAL_UPDATE, checkLegalUpdate, type LegalUpdate } from '../updates';
import { TERMS_CONTENT } from '../terms';
import { PRIVACY_CONTENT } from '../privacy';

const versions = (['fr', 'en', 'ar'] as const).flatMap((l) => [TERMS_CONTENT[l].version, PRIVACY_CONTENT[l].version]);

describe('LEGAL_UPDATE', () => {
  it('matches the published documents and respects the notice rule', () => {
    expect(checkLegalUpdate(LEGAL_UPDATE, versions)).toEqual([]);
  });

  it('every document label shows the current version', () => {
    for (const locale of ['fr', 'en', 'ar'] as const) {
      expect(TERMS_CONTENT[locale].effectiveDateLabel).toContain(LEGAL_UPDATE.version);
      expect(PRIVACY_CONTENT[locale].effectiveDateLabel).toContain(LEGAL_UPDATE.version);
    }
  });
});

describe('checkLegalUpdate', () => {
  const base: LegalUpdate = { ...LEGAL_UPDATE, version: '9.0', publishedOn: '2027-01-01', effectiveOn: '2027-01-01' };

  it('refuses an important change that applies before 30 days', () => {
    expect(checkLegalUpdate({ ...base, important: true, effectiveOn: '2027-01-20' }, ['9.0'])).toHaveLength(1);
    expect(checkLegalUpdate({ ...base, important: true, effectiveOn: '2027-01-31' }, ['9.0'])).toEqual([]);
  });

  it('lets a non-important change apply on publication', () => {
    expect(checkLegalUpdate({ ...base, important: false }, ['9.0'])).toEqual([]);
  });

  it('catches a document left on an older version', () => {
    expect(checkLegalUpdate(base, ['9.0', '8.0'])[0]).toContain('8.0');
  });
});
