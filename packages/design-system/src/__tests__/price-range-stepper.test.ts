import { describe, it, expect, vi } from 'vitest';
import type React from 'react';
import { createElement } from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
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

// Rendered through react-test-renderer (the stepper reads the theme from
// context), then queried by role/label on the rendered host nodes.
function render(props: React.ComponentProps<typeof PriceRangeStepper>): ReactTestInstance {
  let instance: renderer.ReactTestRenderer;
  act(() => {
    instance = renderer.create(createElement(PriceRangeStepper, props));
  });
  return instance!.root;
}

const host = (root: ReactTestInstance, pred: (p: Record<string, unknown>) => boolean): ReactTestInstance[] =>
  root.findAll((n) => typeof n.type === 'string' && pred(n.props as Record<string, unknown>));

function allText(root: ReactTestInstance): string {
  return host(root, () => true)
    .flatMap((n) => n.children.filter((c): c is string => typeof c === 'string'))
    .join(' | ');
}

describe('PriceRangeStepper', () => {
  it('never renders a value outside [min, max], even if `value` is out of range', () => {
    const text = allText(render({ min: 5, max: 10, recommended: 7, value: 99, onChange: vi.fn() }));
    expect(text).toContain('10 DT');
    expect(text).not.toContain('99');
  });

  it('exposes the bound to assistive tech via accessibilityValue on the track', () => {
    const [track] = host(render({ min: 5, max: 10, recommended: 7, value: 6, onChange: vi.fn() }), (p) => p.accessibilityRole === 'adjustable');
    expect(track!.props.accessibilityValue).toEqual({ min: 5, max: 10, now: 6 });
  });

  it('rounds accessibilityValue to integers for a fractional DT price — a non-integer here crashes Fabric', () => {
    // Real-world case: a long route's server-computed bounds/recommendation
    // can legitimately be fractional DT (e.g. 176.5).
    const [track] = host(
      render({ min: 150.5, max: 210, recommended: 176.5, value: 176.5, onChange: vi.fn() }),
      (p) => p.accessibilityRole === 'adjustable',
    );
    expect(track!.props.accessibilityValue).toEqual({ min: 151, max: 210, now: 177 });
  });

  it('disables the decrement button at the min bound and the increment button at the max bound', () => {
    const disabledOf = (root: ReactTestInstance, label: string): unknown =>
      host(root, (p) => p.accessibilityLabel === label)[0]!.props.accessibilityState;
    const atMin = render({ min: 5, max: 10, recommended: 7, value: 5, onChange: vi.fn() });
    expect(disabledOf(atMin, 'Diminuer la contribution')).toEqual({ disabled: true });
    expect(disabledOf(atMin, 'Augmenter la contribution')).toEqual({ disabled: false });
    const atMax = render({ min: 5, max: 10, recommended: 7, value: 10, onChange: vi.fn() });
    expect(disabledOf(atMax, 'Diminuer la contribution')).toEqual({ disabled: false });
    expect(disabledOf(atMax, 'Augmenter la contribution')).toEqual({ disabled: true });
  });

  it('uses caller-supplied labels and formatter', () => {
    const root = render({
      min: 5,
      max: 10,
      recommended: 7,
      value: 6,
      onChange: vi.fn(),
      labels: { suggested: (p) => `Suggested: ${p}` },
      formatValue: (n) => `TND ${n}`,
    });
    expect(allText(root)).toContain('Suggested: TND 7');
  });
});
