import React from 'react';
import { describe, expect, it } from 'vitest';
import renderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { DraggableMapSheet, type DraggableMapSheetHandle } from '../primitives/DraggableMapSheet';
import { lightPalette } from '../theme/palette';
import { renderJSON } from './test-utils/renderJSON';

/**
 * Smoke tests for the docked, draggable map-picker panel (search/
 * pickup-point.tsx, search/dropoff-point.tsx) — a persistent sheet, not a
 * modal, so these cover what a modal's own tests don't need to: it always
 * renders its children (nothing to toggle visible/hidden), the handle
 * carries real accessibility affordances since it's the only drag target,
 * and the imperative `expand()` handle a caller uses to recover from a
 * collapsed state doesn't throw.
 */

describe('DraggableMapSheet', () => {
  it('always renders its children (a persistent panel, never a hidden modal)', () => {
    const tree = renderJSON(
      <DraggableMapSheet theme={lightPalette}>
        <Text>Point sélectionné</Text>
      </DraggableMapSheet>,
    );
    expect(tree).not.toBeNull();
    expect(JSON.stringify(tree)).toContain('Point sélectionné');
  });

  it('gives the handle a real accessibility role, label and hint', () => {
    const tree = renderJSON(
      <DraggableMapSheet theme={lightPalette}>
        <View />
      </DraggableMapSheet>,
    ) as unknown as { children: Array<{ props: Record<string, unknown> }> };
    const handle = tree.children.find((c) => c.props.accessibilityRole === 'button');
    expect(handle).toBeDefined();
    expect(handle!.props.accessibilityLabel).toMatch(/agrandir ou réduire/);
    expect(handle!.props.accessibilityHint).toBeTruthy();
  });

  it('exposes an imperative expand() that does not throw once mounted', () => {
    const ref = React.createRef<DraggableMapSheetHandle>();
    act(() => {
      renderer.create(
        <DraggableMapSheet ref={ref} theme={lightPalette}>
          <View />
        </DraggableMapSheet>,
      );
    });
    expect(ref.current).not.toBeNull();
    expect(() => ref.current?.expand()).not.toThrow();
  });
});
