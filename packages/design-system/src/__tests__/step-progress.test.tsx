import React from 'react';
import { describe, expect, it } from 'vitest';
import { StepProgress } from '../primitives/StepProgress';
import { lightPalette } from '../theme/palette';
import { renderJSON } from './test-utils/renderJSON';

/**
 * Smoke tests for the verification-flow stepper (vehicle → license →
 * insurance → selfie). Asserts the segmented structure, which segments
 * carry the completed/current/upcoming treatments, and that the
 * progressbar accessibility contract survives the redesign.
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

function mergedStyle(node: Node): Record<string, unknown> {
  const styles = Array.isArray(node.props.style)
    ? (node.props.style as Record<string, unknown>[])
    : [node.props.style as Record<string, unknown> | undefined];
  return Object.assign({}, ...styles.filter(Boolean));
}

describe('StepProgress', () => {
  it('renders one segment per step with the current one animated', () => {
    const tree = asNode(renderJSON(<StepProgress currentStep={2} totalSteps={4} />));

    expect(tree.type).toBe('View');
    const segments = childrenOf(tree);
    expect(segments).toHaveLength(4);

    // Completed segments are static views; only the current one carries
    // the sweeping Animated fill; upcoming ones stay empty.
    expect(childrenOf(segments[0]!)).toHaveLength(0);
    expect(childrenOf(segments[1]!).map((c) => c.type)).toEqual(['Animated.View']);
    expect(childrenOf(segments[2]!)).toHaveLength(0);
    expect(childrenOf(segments[3]!)).toHaveLength(0);
  });

  it('paints completed segments with the theme accent and upcoming ones with the track', () => {
    const tree = asNode(
      renderJSON(<StepProgress currentStep={3} totalSteps={4} theme={lightPalette} />),
    );
    const segments = childrenOf(tree);

    expect(mergedStyle(segments[0]!).backgroundColor).toBe(lightPalette.accent);
    expect(mergedStyle(segments[1]!).backgroundColor).toBe(lightPalette.accent);
    // Current segment's track + upcoming tracks use the faint outline.
    expect(mergedStyle(segments[2]!).backgroundColor).toBe(lightPalette.outlineVariant);
    expect(mergedStyle(segments[3]!).backgroundColor).toBe(lightPalette.outlineVariant);
    // Its inner sweep inherits the accent too.
    const sweepFill = childrenOf(segments[2]!)[0]!;
    expect(mergedStyle(sweepFill).backgroundColor).toBe(lightPalette.accent);
  });

  it('keeps the progressbar contract for assistive tech', () => {
    const tree = asNode(renderJSON(<StepProgress currentStep={2} totalSteps={4} />));

    expect(tree.props.accessible).toBe(true);
    expect(tree.props.accessibilityRole).toBe('progressbar');
    expect(tree.props.accessibilityLabel).toBe('Étape 2 sur 4');
    expect(tree.props.accessibilityValue).toEqual({ min: 1, max: 4, now: 2 });
  });
});
