import { describe, it, expect, vi } from 'vitest';
import type React from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { AgendaRow, AgendaGroup } from '../primitives/AgendaRow';
import { SegmentedTabs } from '../primitives/SegmentedTabs';
import { SpotlightCard } from '../primitives/SpotlightCard';
import { lightPalette } from '../theme/palette';

function render(element: React.ReactElement): ReactTestInstance {
  let instance: renderer.ReactTestRenderer;
  act(() => {
    instance = renderer.create(element);
  });
  return instance!.root;
}

const hosts = (root: ReactTestInstance, predicate: (n: ReactTestInstance) => boolean) =>
  root.findAll((n) => typeof n.type === 'string' && predicate(n));

function flatStyle(node: ReactTestInstance): Record<string, unknown> {
  const style = node.props.style as unknown;
  const parts = (Array.isArray(style) ? style.flat(Infinity) : [style]) as Record<string, unknown>[];
  return Object.assign({}, ...parts.filter(Boolean));
}

const texts = (root: ReactTestInstance): string[] =>
  hosts(root, (n) => n.type === 'Text').map((n) => [n.props.children].flat().join(''));

describe('AgendaRow', () => {
  it('reads time, title, role and status, with the status dot in its tone', () => {
    const root = render(
      <AgendaGroup>
        <AgendaRow
          time="08:00"
          timeDetail="→ 10:05"
          title="Tunis → Sousse"
          roleLabel="Conducteur"
          roleSolid
          status="1 / 3 · 2 demandes"
          statusTone="warning"
          trailing="18,5 DT"
          onPress={() => undefined}
          accessibilityLabel="Demain 08:00, Tunis vers Sousse, conducteur, 2 demandes"
        />
      </AgendaGroup>,
    );
    expect(texts(root)).toEqual(expect.arrayContaining(['08:00', '→ 10:05', 'Tunis → Sousse', 'Conducteur', '1 / 3 · 2 demandes', '18,5 DT']));
    const [dot] = hosts(root, (n) => n.props.testID === 'agenda-status-dot');
    expect(flatStyle(dot!).backgroundColor).toBe(lightPalette.warning);
    const [row] = hosts(root, (n) => n.props.accessibilityRole === 'button');
    expect(row!.props.accessibilityLabel).toContain('2 demandes');
  });

  it('runs its inline action, not the row press', () => {
    const onAction = vi.fn();
    const onPress = vi.fn();
    const root = render(
      <AgendaRow
        icon="people-outline"
        title="2 demandes de place"
        status="Tunis → Sousse"
        actionLabel="Répondre"
        onAction={onAction}
        onPress={onPress}
        highlighted
        accessibilityLabel="2 demandes de place"
      />,
    );
    const [action] = hosts(root, (n) => n.props.accessibilityLabel === 'Répondre — 2 demandes de place');
    act(() => action!.props.onClick?.() ?? action!.props.onPress?.());
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    const [row] = hosts(root, (n) => n.props.testID === 'agenda-row');
    expect(flatStyle(row!).backgroundColor).toBe(lightPalette.warningMuted);
  });

  it('hides the role chip when no role is given', () => {
    const root = render(<AgendaRow time="18:15" title="Lac 2 → La Marsa" status="Confirmée" accessibilityLabel="x" />);
    expect(hosts(root, (n) => n.props.testID === 'agenda-role')).toHaveLength(0);
  });
});

describe('SegmentedTabs', () => {
  it('is a tablist that marks the selected tab and reports changes', () => {
    const onChange = vi.fn();
    const root = render(
      <SegmentedTabs
        tabs={[
          { key: 'upcoming', label: 'À venir', count: 3 },
          { key: 'history', label: 'Historique' },
        ]}
        value="upcoming"
        onChange={onChange}
      />,
    );
    const tabs = hosts(root, (n) => n.props.accessibilityRole === 'tab');
    expect(tabs.map((t) => [t.props.accessibilityLabel, t.props.accessibilityState.selected])).toEqual([
      ['À venir · 3', true],
      ['Historique', false],
    ]);
    act(() => tabs[1]!.props.onClick?.() ?? tabs[1]!.props.onPress?.());
    expect(onChange).toHaveBeenCalledWith('history');
    expect(hosts(root, (n) => n.props.accessibilityRole === 'tablist')).toHaveLength(1);
  });
});

describe('SpotlightCard', () => {
  it('shows the moment, the trip and its actions', () => {
    const onPrimary = vi.fn();
    const root = render(
      <SpotlightCard
        eyebrow="Départ dans 2 h 05 · Passager"
        live
        title="Lac 2 → La Marsa"
        subtitle="Aujourd'hui · 18:15 → 18:40"
        primaryAction={{ label: 'Voir le point de rendez-vous', onPress: onPrimary }}
        secondaryAction={{ label: 'Message', onPress: () => undefined, icon: 'chatbubble-outline' }}
        accessibilityLabel="Prochain trajet, Lac 2 vers La Marsa"
      />,
    );
    expect(texts(root)).toEqual(expect.arrayContaining(['Départ dans 2 h 05 · Passager', 'Lac 2 → La Marsa']));
    const [primary] = hosts(root, (n) => n.props.accessibilityLabel === 'Voir le point de rendez-vous');
    act(() => primary!.props.onClick?.() ?? primary!.props.onPress?.());
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });
});
