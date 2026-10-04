import { describe, it, expect } from 'vitest';
import { roundForAddressLookup } from '../coordinates';

describe('roundForAddressLookup', () => {
  it('rounds to ~11 m so GPS jitter reuses the same address lookup', () => {
    const a = roundForAddressLookup({ lat: 36.848213, lng: 10.172041 });
    const b = roundForAddressLookup({ lat: 36.848187, lng: 10.171989 });
    expect(a).toEqual({ lat: 36.8482, lng: 10.172 });
    expect(b).toEqual(a);
  });
});
