import { describe, expect, it } from 'vitest';
import { isSwipeDismiss } from '../primitives/Toast';

const base = { translationX: 0, translationY: 0, velocityX: 0, velocityY: 0 };

describe('isSwipeDismiss', () => {
  it('dismisses a rightward swipe past the distance threshold', () => {
    expect(isSwipeDismiss({ ...base, translationX: 120 })).toBe(true);
  });

  it('dismisses a leftward swipe past the distance threshold', () => {
    expect(isSwipeDismiss({ ...base, translationX: -120 })).toBe(true);
  });

  it('dismisses an upward swipe past the distance threshold', () => {
    expect(isSwipeDismiss({ ...base, translationY: -100 })).toBe(true);
  });

  it('dismisses a fast sideways flick even under the distance threshold', () => {
    expect(isSwipeDismiss({ ...base, translationX: 20, velocityX: 900 })).toBe(true);
  });

  it('dismisses a fast upward flick even under the distance threshold', () => {
    expect(isSwipeDismiss({ ...base, translationY: -20, velocityY: -900 })).toBe(true);
  });

  it('never dismisses on a downward drag, however far', () => {
    expect(isSwipeDismiss({ ...base, translationY: 300, velocityY: 2000 })).toBe(false);
  });

  it('springs back on a small idle release', () => {
    expect(isSwipeDismiss({ ...base, translationX: 20, translationY: -10 })).toBe(false);
  });
});
