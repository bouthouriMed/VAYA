import { describe, it, expect } from 'vitest';
import { stepPrice, resolveInitialPrice } from '../priceSelection';

describe('stepPrice', () => {
  it('increments within bounds', () => {
    expect(stepPrice(5, 1, 3, 10, 0.5)).toBe(5.5);
  });

  it('decrements within bounds', () => {
    expect(stepPrice(5, -1, 3, 10, 0.5)).toBe(4.5);
  });

  it('never goes below min, however many times it is decremented', () => {
    let value = 3.5;
    for (let i = 0; i < 10; i += 1) {
      value = stepPrice(value, -1, 3, 10, 0.5);
    }
    expect(value).toBe(3);
    expect(value).toBeGreaterThanOrEqual(3);
  });

  it('never goes above max, however many times it is incremented', () => {
    let value = 9.5;
    for (let i = 0; i < 10; i += 1) {
      value = stepPrice(value, 1, 3, 10, 0.5);
    }
    expect(value).toBe(10);
    expect(value).toBeLessThanOrEqual(10);
  });
});

describe('resolveInitialPrice', () => {
  it('opens on the recommended value', () => {
    expect(resolveInitialPrice(3, 6, 10)).toBe(6);
  });

  it('clamps a defensively malformed recommended value into bounds', () => {
    expect(resolveInitialPrice(3, 999, 10)).toBe(10);
    expect(resolveInitialPrice(3, -5, 10)).toBe(3);
  });
});
