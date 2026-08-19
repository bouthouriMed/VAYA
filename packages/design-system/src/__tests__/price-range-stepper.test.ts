import { describe, it, expect, vi } from 'vitest';
import { PriceRangeStepper, clampPrice } from '../primitives/PriceRangeStepper';

describe('clampPrice', () => {
  it('leaves an in-range value untouched', () => {
    expect(clampPrice(7, 5, 10)).toBe(7);
  });

  it('clamps a value below min', () => {
    expect(clampPrice(2, 5, 10)).toBe(5);
  });

  it('clamps a value above max', () => {
    expect(clampPrice(99, 5, 10)).toBe(10);
  });

  it('falls back to min for a malformed (max < min) bound rather than crashing', () => {
    expect(clampPrice(7, 10, 5)).toBe(10);
  });
});

// Same "call the function component directly" pattern as
// accessibility.test.ts — PriceRangeStepper has no internal hooks, so this
// is a valid way to assert on the props actually reaching the underlying
// RN elements without needing a full renderer.
describe('PriceRangeStepper', () => {
  it('never renders a value outside [min, max], even if `value` is out of range', () => {
    const element = PriceRangeStepper({ min: 5, max: 10, recommended: 7, value: 99, onChange: vi.fn() });
    const valueBox = element.props.children[1]; // stepperRow -> [decrement, valueBox, increment]
    const valueText = valueBox.props.children[1].props.children;
    const displayedText = JSON.stringify(valueText);
    expect(displayedText).toContain('10');
    expect(displayedText).not.toContain('99');
  });

  it('exposes the bound to assistive tech via accessibilityValue on the track', () => {
    const element = PriceRangeStepper({ min: 5, max: 10, recommended: 7, value: 6, onChange: vi.fn() });
    // container -> [label, stepperRow, track, captionRow, estimateNote?]
    const track = element.props.children[2];
    expect(track.props.accessibilityRole).toBe('adjustable');
    expect(track.props.accessibilityValue).toEqual({ min: 5, max: 10, now: 6 });
  });

  it('disables the decrement button at the min bound and the increment button at the max bound', () => {
    const atMin = PriceRangeStepper({ min: 5, max: 10, recommended: 7, value: 5, onChange: vi.fn() });
    const atMinRow = atMin.props.children[1];
    expect(atMinRow.props.children[0].props.disabled).toBe(true); // decrement
    expect(atMinRow.props.children[2].props.disabled).toBe(false); // increment

    const atMax = PriceRangeStepper({ min: 5, max: 10, recommended: 7, value: 10, onChange: vi.fn() });
    const atMaxRow = atMax.props.children[1];
    expect(atMaxRow.props.children[0].props.disabled).toBe(false); // decrement
    expect(atMaxRow.props.children[2].props.disabled).toBe(true); // increment
  });
});
