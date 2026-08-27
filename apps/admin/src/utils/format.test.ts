import { describe, expect, it } from 'vitest';
import { formatRatio, formatNumber, formatCurrency, humanize } from './format';

describe('formatRatio', () => {
  it('renders an honest dash for a null ratio (zero-denominator case), never 0%', () => {
    expect(formatRatio(null)).toBe('—');
    expect(formatRatio(undefined)).toBe('—');
  });

  it('renders a real ratio as a rounded percentage', () => {
    expect(formatRatio(0.5)).toBe('50%');
    expect(formatRatio(0.333)).toBe('33%');
    expect(formatRatio(1)).toBe('100%');
    expect(formatRatio(0)).toBe('0%');
  });
});

describe('formatNumber', () => {
  it('handles null/undefined', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
  });

  it('formats a real number with thousands separators', () => {
    expect(formatNumber(1234)).toBe('1,234');
  });
});

describe('formatCurrency', () => {
  it('formats with 2 decimals and the DT suffix', () => {
    expect(formatCurrency(12)).toBe('12.00 DT');
    expect(formatCurrency(12.5)).toBe('12.50 DT');
  });

  it('handles null', () => {
    expect(formatCurrency(null)).toBe('—');
  });
});

describe('humanize', () => {
  it('converts a snake_case/CONSTANT_CASE token into Title Case', () => {
    expect(humanize('resubmission_required')).toBe('Resubmission Required');
    expect(humanize('VERIFICATION_APPROVED')).toBe('VERIFICATION APPROVED');
  });
});
