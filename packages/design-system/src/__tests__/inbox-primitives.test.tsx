import { describe, it, expect } from 'vitest';
import type React from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { RouteSegmentBar } from '../primitives/RouteSegmentBar';
import { CountdownRing } from '../primitives/CountdownRing';
import { ActivityRow } from '../primitives/ActivityRow';
import { FactRow } from '../primitives/FactRow';
import { lightPalette } from '../theme/palette';

function render(element: React.ReactElement): ReactTestInstance {
  let instance: renderer.ReactTestRenderer;
  act(() => {
    instance = renderer.create(element);
  });
  return instance!.root;
}

function hostByTestId(root: ReactTestInstance, testID: string): ReactTestInstance[] {
  return root.findAll((n) => typeof n.type === 'string' && n.props.testID === testID);
}

function flatStyle(node: ReactTestInstance): Record<string, unknown> {
  const style = node.props.style as unknown;
  const parts = (Array.isArray(style) ? style.flat(Infinity) : [style]) as Record<string, unknown>[];
  return Object.assign({}, ...parts.filter(Boolean));
}

describe('RouteSegmentBar', () => {
  const bar = (start: number, end: number) =>
    render(
      <RouteSegmentBar
        startLabel="Ksar Said"
        endLabel="El Mourouj"
        segmentStart={start}
        segmentEnd={end}
        accessibilityLabel="Sidi Hassine jusqu'à El Mourouj, sur votre trajet Ksar Said – El Mourouj"
      />,
    );

  it("highlights the passenger's part of the ride at its real position", () => {
    const root = bar(0.4, 1);
    const style = flatStyle(hostByTestId(root, 'route-segment')[0]!);
    expect(style.left).toBe('40%');
    expect(style.width).toBe('60%');
    expect(style.backgroundColor).toBe(lightPalette.accent);
  });

  it('keeps a very short leg visible', () => {
    const style = flatStyle(hostByTestId(bar(0.5, 0.505), 'route-segment')[0]!);
    expect(style.width).toBe('4%');
  });

  it('is one labelled image for screen readers', () => {
    const [image] = bar(0, 1).findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'image');
    expect(image!.props.accessibilityLabel).toContain('Sidi Hassine');
  });
});

describe('CountdownRing', () => {
  const ring = (remaining: number) =>
    render(<CountdownRing remaining={remaining} value="12" unit="min" accessibilityLabel="12 minutes pour répondre" />);

  it('exposes the time left as a progress value', () => {
    const [progress] = ring(0.6).findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'progressbar');
    expect(progress!.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 60 });
    expect(progress!.props.accessibilityLabel).toBe('12 minutes pour répondre');
  });

  it('turns amber in the last quarter, never before', () => {
    const arc = (root: ReactTestInstance) => root.findAll((n) => n.props.testID === 'countdown-arc')[0]!;
    expect(arc(ring(0.6)).props.stroke).toBe(lightPalette.accent);
    expect(arc(ring(0.2)).props.stroke).toBe(lightPalette.warning);
  });
});

describe('ActivityRow', () => {
  it('is a labelled button that marks unread and draws the thread on request', () => {
    const root = render(
      <ActivityRow
        icon="checkmark-circle-outline"
        tone="accent"
        title="Réservation confirmée"
        description="Mehdi a accepté votre demande."
        timestamp="18:17"
        unread
        connectToNext
        onPress={() => {}}
        accessibilityLabel="Réservation confirmée, non lue"
      />,
    );
    const [button] = root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button');
    expect(button!.props.accessibilityLabel).toBe('Réservation confirmée, non lue');
    expect(hostByTestId(root, 'activity-unread')).toHaveLength(1);
    expect(hostByTestId(root, 'activity-thread')).toHaveLength(1);
  });

  it('a read row with no follower has neither dot nor thread', () => {
    const root = render(
      <ActivityRow icon="flag-outline" title="Trajet terminé" timestamp="jeu. 8 oct." accessibilityLabel="Trajet terminé" />,
    );
    expect(hostByTestId(root, 'activity-unread')).toHaveLength(0);
    expect(hostByTestId(root, 'activity-thread')).toHaveLength(0);
  });
});

describe('FactRow', () => {
  it('reads each fact as value plus what it is', () => {
    const root = render(
      <FactRow
        facts={[
          { icon: 'time-outline', value: '+3 min', caption: 'détour' },
          { icon: 'cash-outline', value: '4,5 DT', caption: 'gain', emphasis: true },
        ]}
      />,
    );
    const labels = root
      .findAll((n) => typeof n.type === 'string' && n.props.accessible === true)
      .map((n) => n.props.accessibilityLabel);
    expect(labels).toEqual(['+3 min détour', '4,5 DT gain']);
  });
});
