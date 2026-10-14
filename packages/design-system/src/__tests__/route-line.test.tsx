import { describe, it, expect } from 'vitest';
import React from 'react';
import { RouteLine } from '../primitives/RouteLine';
import { lightPalette } from '../theme/palette';
import { renderJSON } from './test-utils/renderJSON';

type JsonNode = { type: string; props: Record<string, unknown>; children?: (JsonNode | string)[] | null };

function polylines(tree: ReturnType<typeof renderJSON>): JsonNode[] {
  const nodes = (tree === null ? [] : Array.isArray(tree) ? tree : [tree]) as JsonNode[];
  return nodes.filter((n) => n.type === 'Polyline');
}

const ROUTE = [
  { latitude: 36.83, longitude: 10.13 },
  { latitude: 36.85, longitude: 10.2 },
  { latitude: 36.88, longitude: 10.32 },
];

describe('RouteLine', () => {
  it('draws a light casing under a solid accent core', () => {
    const lines = polylines(renderJSON(<RouteLine coordinates={ROUTE} theme={lightPalette} />));
    expect(lines).toHaveLength(2);
    const [casing, core] = lines;
    expect(casing!.props.strokeColor).toBe(lightPalette.surface);
    expect(core!.props.strokeColor).toBe(lightPalette.accent);
    expect(casing!.props.strokeWidth as number).toBeGreaterThan(core!.props.strokeWidth as number);
    expect(core!.props.lineDashPattern).toBeUndefined();
  });

  it('makes legs with passengers aboard heavier and stronger', () => {
    const lines = polylines(
      renderJSON(
        <RouteLine
          coordinates={ROUTE}
          segments={[
            { coordinates: ROUTE.slice(0, 2), emphasis: 0 },
            { coordinates: ROUTE.slice(1), emphasis: 2 },
          ]}
          theme={lightPalette}
        />,
      ),
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]!.props.strokeColor).toBe(lightPalette.accent);
    expect(lines[2]!.props.strokeColor).toBe(lightPalette.accentStrong);
    expect(lines[2]!.props.strokeWidth as number).toBeGreaterThan(lines[1]!.props.strokeWidth as number);
  });

  it('dashes the core only for approximate geometry, and draws nothing for under two points', () => {
    const dashed = polylines(renderJSON(<RouteLine coordinates={ROUTE} dashed theme={lightPalette} />));
    expect(dashed[1]!.props.lineDashPattern).toBeDefined();
    expect(renderJSON(<RouteLine coordinates={ROUTE.slice(0, 1)} theme={lightPalette} />)).toBeNull();
  });
});
