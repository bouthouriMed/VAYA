import React from 'react';
import { describe, expect, it } from 'vitest';
import { PickupPin, DropoffPin, StopPin, PassengerStopPin } from '../primitives/RideStopMarkers';
import { lightPalette } from '../theme/palette';
import { renderJSON } from './test-utils/renderJSON';

/**
 * Smoke tests for the ride-stop map-marker family: the teardrop
 * pickup/dropoff pair and the numbered candidate-stop circle shared by
 * Publish's recommended points and the passenger stop-selection maps.
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

describe('PickupPin / DropoffPin', () => {
  it('renders accent for pickup and ink for dropoff, both surface-bordered teardrops', () => {
    const pickup = asNode(renderJSON(<PickupPin theme={lightPalette} />));
    const dropoff = asNode(renderJSON(<DropoffPin theme={lightPalette} />));

    expect(pickup.type).toBe('View');
    expect(mergedStyle(pickup).backgroundColor).toBe(lightPalette.accent);
    expect(mergedStyle(pickup).borderColor).toBe(lightPalette.surface);

    expect(dropoff.type).toBe('View');
    expect(mergedStyle(dropoff).backgroundColor).toBe(lightPalette.ink);
    expect(mergedStyle(dropoff).borderColor).toBe(lightPalette.surface);
  });
});

describe('StopPin', () => {
  it('renders an unselected numbered circle: surface fill, outline border, ink label', () => {
    const tree = asNode(renderJSON(<StopPin theme={lightPalette} index={2} />));

    expect(tree.type).toBe('View');
    expect(mergedStyle(tree).backgroundColor).toBe(lightPalette.surface);
    expect(mergedStyle(tree).borderColor).toBe(lightPalette.outline);

    const label = childrenOf(tree)[0]!;
    expect(label.type).toBe('Text');
    expect(label.children).toEqual(['2']);
    expect(mergedStyle(label).color).toBe(lightPalette.ink);
  });

  it('inverts to solid ink with an onInk label when selected', () => {
    const tree = asNode(renderJSON(<StopPin theme={lightPalette} index={1} selected />));

    expect(mergedStyle(tree).backgroundColor).toBe(lightPalette.ink);
    expect(mergedStyle(tree).borderColor).toBe(lightPalette.ink);

    const label = childrenOf(tree)[0]!;
    expect(mergedStyle(label).color).toBe(lightPalette.onInk);
  });

  it('renders a flag glyph instead of a number for anchor stops', () => {
    const tree = asNode(renderJSON(<StopPin theme={lightPalette} index={1} flag />));
    expect(childrenOf(tree)[0]!.type).toBe('Ionicons');
  });
});

describe('PassengerStopPin', () => {
  it('renders a small accentStrong-filled circle with a person glyph for pickup', () => {
    const tree = asNode(renderJSON(<PassengerStopPin theme={lightPalette} kind="pickup" />));

    expect(tree.type).toBe('View');
    expect(mergedStyle(tree).backgroundColor).toBe(lightPalette.accentStrong);
    expect(mergedStyle(tree).borderColor).toBe(lightPalette.surface);

    const glyph = childrenOf(tree)[0]!;
    expect(glyph.type).toBe('Ionicons');
    expect(glyph.props.name).toBe('person');
  });

  it('renders a checkmark glyph for dropoff, same accentStrong fill', () => {
    const tree = asNode(renderJSON(<PassengerStopPin theme={lightPalette} kind="dropoff" />));

    expect(mergedStyle(tree).backgroundColor).toBe(lightPalette.accentStrong);
    const glyph = childrenOf(tree)[0]!;
    expect(glyph.props.name).toBe('checkmark');
  });
});
