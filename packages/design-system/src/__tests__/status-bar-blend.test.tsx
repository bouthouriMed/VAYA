import React from 'react';
import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusBarBlend } from '../primitives/StatusBarBlend';
import { lightPalette, darkPalette } from '../theme/palette';
import { renderJSON } from './test-utils/renderJSON';

/**
 * Smoke tests for the progressive frost that blends full-bleed map content
 * into the OS status bar (explore.tsx's top edge). The mocked BlurView /
 * LinearGradient are opaque element-type strings, so assertions walk the
 * test-renderer JSON: band count/intensities, scheme-driven tint polarity,
 * the background wash gradient, and the decorative accessibility contract.
 *
 * The blur strips only render on iOS (see StatusBarBlend.tsx's doc comment
 * on why Android relies on the gradient wash alone) — the mocked
 * `Platform.OS` defaults to 'web', which exercises that same non-iOS
 * fallback, so the blur-specific tests below pin it to 'ios' for their
 * duration and restore it afterward.
 */

type Node = {
  type: string;
  props: Record<string, unknown>;
  children?: Node[];
};

function asNode(tree: unknown): Node {
  return tree as Node;
}

function childrenOf(node: Node | null): Node[] {
  return Array.isArray(node?.children) ? node!.children.filter(Boolean) : [];
}

describe('StatusBarBlend', () => {
  describe('on iOS', () => {
    let originalOS: string;

    beforeEach(() => {
      originalOS = Platform.OS;
      (Platform as { OS: string }).OS = 'ios';
    });

    afterEach(() => {
      (Platform as { OS: string }).OS = originalOS;
    });

    it('renders five blur strips ramping toward the top plus one wash gradient', () => {
      const tree = asNode(renderJSON(<StatusBarBlend height={100} theme={lightPalette} scheme="light" />));

      expect(tree.type).toBe('View');
      const layers = childrenOf(tree);
      const strips = layers.filter((l) => l.type === 'BlurView');
      const washes = layers.filter((l) => l.type === 'LinearGradient');

      expect(strips).toHaveLength(5);
      expect(washes).toHaveLength(1);

      // Intensity strictly increases bottom → top; boundaries tile exactly.
      const intensities = strips.map((s) => s.props.intensity);
      expect(intensities).toEqual([14, 28, 44, 60, 78]);
      // Style is the raw array [absoluteFill, {top, bottom}] — merge per
      // strip, then verify contiguous coverage of the container: each band
      // starts exactly where the previous ends, from 0 through the height,
      // so rounding can never open a seam between neighbors.
      const spans = strips.map((s) => {
        const entries = (s.props.style as unknown[]).filter(Boolean) as Array<
          Record<string, number>
        >;
        const { top = 0, bottom = 0 } = Object.assign({}, ...entries);
        return { start: top, end: 100 - bottom };
      });
      expect(spans[0]!.start).toBe(0);
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i]!.start).toBe(spans[i - 1]!.end);
      }
      expect(spans[spans.length - 1]!.end).toBe(100);
    });

    it('flips tint polarity with the color scheme and washes with the theme background', () => {
      const light = asNode(renderJSON(<StatusBarBlend height={100} theme={lightPalette} scheme="light" />));
      const dark = asNode(renderJSON(<StatusBarBlend height={100} theme={darkPalette} scheme="dark" />));

      for (const strip of childrenOf(light).filter((l) => l.type === 'BlurView')) {
        expect(strip.props.tint).toBe('light');
      }
      for (const strip of childrenOf(dark).filter((l) => l.type === 'BlurView')) {
        expect(strip.props.tint).toBe('dark');
      }

      const wash = childrenOf(dark).find((l) => l.type === 'LinearGradient');
      expect(wash).toBeDefined();
      expect(wash!.props.colors[0]).toBe(`${darkPalette.background}D9`);
      expect(wash!.props.colors[2]).toBe(`${darkPalette.background}00`);
    });
  });

  it('renders no blur strips off iOS, relying on the gradient wash alone', () => {
    const tree = asNode(renderJSON(<StatusBarBlend height={100} theme={lightPalette} scheme="light" />));

    const layers = childrenOf(tree);
    expect(layers.filter((l) => l.type === 'BlurView')).toHaveLength(0);
    expect(layers.filter((l) => l.type === 'LinearGradient')).toHaveLength(1);
  });

  it('is pointer-transparent and hidden from accessibility', () => {
    const tree = asNode(renderJSON(<StatusBarBlend height={100} theme={lightPalette} scheme="light" />));

    expect(tree.props.pointerEvents).toBe('none');
    expect(tree.props.accessibilityElementsHidden).toBe(true);
    expect(tree.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('renders nothing for a non-positive height', () => {
    expect(renderJSON(<StatusBarBlend height={0} theme={lightPalette} scheme="light" />)).toBeNull();
  });
});
