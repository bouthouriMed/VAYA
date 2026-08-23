import { describe, expect, it } from 'vitest';
import { pickSnapTarget } from '../primitives/ExplorerSheet';

const COLLAPSED = 400;

describe('pickSnapTarget', () => {
  it('snaps to expanded (0) when closer to the top with no decisive flick', () => {
    expect(pickSnapTarget(100, 0, COLLAPSED)).toBe(0);
  });

  it('snaps to collapsed when closer to the bottom with no decisive flick', () => {
    expect(pickSnapTarget(300, 0, COLLAPSED)).toBe(COLLAPSED);
  });

  it('a fast downward flick collapses even from near the top', () => {
    expect(pickSnapTarget(50, 900, COLLAPSED)).toBe(COLLAPSED);
  });

  it('a fast upward flick expands even from near the bottom', () => {
    expect(pickSnapTarget(350, -900, COLLAPSED)).toBe(0);
  });

  it('sits exactly at the midpoint expands (ties favor expanded)', () => {
    expect(pickSnapTarget(COLLAPSED / 2, 0, COLLAPSED)).toBe(0);
  });

  it('a slow drag below the flick threshold falls back to position', () => {
    expect(pickSnapTarget(380, 400, COLLAPSED)).toBe(COLLAPSED);
    expect(pickSnapTarget(20, -400, COLLAPSED)).toBe(0);
  });
});
