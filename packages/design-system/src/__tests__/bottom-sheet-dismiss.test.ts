import { describe, expect, it } from 'vitest';
import { isDismissalDrag } from '../primitives/BottomSheet';

/**
 * Regression tests for the calendar-sheets bug: swiping right to change
 * the month dismissed the whole sheet. The month-swipe's failOffsetY can
 * lose its activation race to this sheet's activeOffsetY on a rightward
 * drag with downward drift, so the sheet's pan ends holding a long
 * diagonal — thresholds alone (translationY > 100 || velocityY > 800)
 * treated that as dismiss. Dismissal now additionally requires vertical
 * intent to dominate horizontally.
 */

const base = { translationX: 0, velocityX: 0 };

describe('isDismissalDrag', () => {
  it('dismisses a genuinely vertical drag past the distance threshold', () => {
    expect(isDismissalDrag({ ...base, translationY: 140 })).toBe(true);
  });

  it('dismisses a genuine vertical flick past the velocity threshold', () => {
    expect(
      isDismissalDrag({ translationY: 40, translationX: 0, velocityY: 1200, velocityX: 100 }),
    ).toBe(true);
  });

  it('keeps the sheet open below both thresholds', () => {
    expect(isDismissalDrag({ ...base, translationY: 60 })).toBe(false);
  });

  it('never dismisses the long horizontal month-swipe regression case', () => {
    // Rightward swipe with downward drift: huge |translationX|, translationY
    // over the raw threshold purely from diagonal accumulation.
    expect(
      isDismissalDrag({ translationX: -260, translationY: 120, velocityX: -1800, velocityY: 500 }),
    ).toBe(false);
  });

  it('never dismisses a horizontal-dominant flick regardless of speed', () => {
    expect(
      isDismissalDrag({ translationX: -300, translationY: 90, velocityX: -2500, velocityY: 900 }),
    ).toBe(false);
  });

  it('still dismisses a diagonal that leans clearly downward', () => {
    expect(isDismissalDrag({ translationX: 60, translationY: 160, velocityX: 300, velocityY: 1100 })).toBe(true);
  });
});
