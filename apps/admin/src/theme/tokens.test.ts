import { describe, expect, it } from 'vitest';
import { isUnderservedCorridor, MIN_DEMAND_FOR_SIGNAL } from './tokens';

describe('isUnderservedCorridor', () => {
  it('never flags below the minimum demand signal threshold, even with zero supply', () => {
    expect(isUnderservedCorridor(MIN_DEMAND_FOR_SIGNAL - 1, 0)).toBe(false);
  });

  it('flags a high-demand corridor with zero supply', () => {
    expect(isUnderservedCorridor(20, 0)).toBe(true);
  });

  it('flags a high-demand corridor whose supply covers less than a third of demand', () => {
    expect(isUnderservedCorridor(30, 5)).toBe(true);
  });

  it('does not flag a corridor with adequate supply', () => {
    expect(isUnderservedCorridor(30, 15)).toBe(false);
  });
});
