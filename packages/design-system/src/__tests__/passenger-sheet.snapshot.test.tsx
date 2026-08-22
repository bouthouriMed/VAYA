import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import renderer, { act } from 'react-test-renderer';
import {
  PassengerSheet,
  formatPassengerCount,
  clampPassengerCount,
} from '../primitives/PassengerSheet';
import { renderJSON } from './test-utils/renderJSON';

/**
 * PassengerSheet — the passenger-count picker that gives explore.tsx's
 * "Passagers" field the same tap-to-open sheet grammar as Date/Heure
 * (draft edits, confirm commits, drag-away discards). Snapshot covers the
 * open stage; the interaction tests pin the draft/confirm contract and the
 * min/max disabled states.
 */

function findButton(instance: renderer.ReactTestRenderer, testID: string): renderer.ReactTestInstance {
  const match = instance.root.findAll((node) => node.props.testID === testID)[0];
  if (!match) throw new Error(`No element with testID ${testID}`);
  return match;
}

describe('PassengerSheet snapshots', () => {
  it('renders the stepper stage with the given value selected', () => {
    const tree = renderJSON(
      <PassengerSheet visible onClose={() => {}} value={2} onChange={() => {}} />,
    );
    expect(tree).toMatchSnapshot();
  });

  it('renders nothing while not visible', () => {
    const tree = renderJSON(
      <PassengerSheet visible={false} onClose={() => {}} value={2} onChange={() => {}} />,
    );
    expect(tree).toBeNull();
  });
});

describe('PassengerSheet behavior', () => {
  it('edits a draft and commits it only on confirm', () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    let instance!: renderer.ReactTestRenderer;
    act(() => {
      instance = renderer.create(
        <PassengerSheet visible onClose={onClose} value={2} onChange={onChange} />,
      );
    });

    act(() => {
      findButton(instance, 'passenger-increment').props.onPress();
      findButton(instance, 'passenger-increment').props.onPress();
    });
    // Draft edits alone never touch the committed value.
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      findButton(instance, 'passenger-confirm').props.onPress();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables increment at max and decrement at min', () => {
    let instance!: renderer.ReactTestRenderer;
    act(() => {
      instance = renderer.create(
        <PassengerSheet visible onClose={() => {}} value={8} onChange={() => {}} />,
      );
    });
    expect(findButton(instance, 'passenger-increment').props.disabled).toBe(true);
    expect(findButton(instance, 'passenger-decrement').props.disabled).toBe(false);

    act(() => {
      instance.update(<PassengerSheet visible onClose={() => {}} value={1} onChange={() => {}} />);
    });
    expect(findButton(instance, 'passenger-decrement').props.disabled).toBe(true);
    expect(findButton(instance, 'passenger-increment').props.disabled).toBe(false);
  });
});

describe('pure helpers', () => {
  it('pluralizes the French count label', () => {
    expect(formatPassengerCount(1)).toBe('1 passager');
    expect(formatPassengerCount(3)).toBe('3 passagers');
  });

  it('clamps counts into bounds and rounds fractional input', () => {
    expect(clampPassengerCount(0, 1, 8)).toBe(1);
    expect(clampPassengerCount(9, 1, 8)).toBe(8);
    expect(clampPassengerCount(3.6, 1, 8)).toBe(4);
  });
});
