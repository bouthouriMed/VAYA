import { describe, it, expect } from 'vitest';
import type React from 'react';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { Button } from '../primitives/Button';
import { Chip } from '../primitives/Chip';
import { Badge } from '../primitives/Badge';
import { MessageBubble } from '../primitives/MessageBubble';
import { StarRatingInput } from '../primitives/StarRatingInput';
import { ScreenHeader } from '../primitives/ScreenHeader';
import { Input } from '../primitives/Input';
import { StateView } from '../primitives/StateView';

// Renders through react-test-renderer (primitives read the theme from
// context, so they must render for real, not be called as plain functions)
// and asserts the accessibility props on the rendered host nodes.
function render(element: React.ReactElement): ReactTestInstance {
  let instance: renderer.ReactTestRenderer;
  act(() => {
    instance = renderer.create(element);
  });
  return instance!.root;
}

function byRole(root: ReactTestInstance, role: string): ReactTestInstance[] {
  return root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === role);
}

describe('accessibility baseline', () => {
  it('Button exposes a button role and a label defaulting to its visible label', () => {
    const [button] = byRole(render(<Button label="Publier" onPress={() => {}} />), 'button');
    expect(button!.props.accessibilityLabel).toBe('Publier');
  });

  it('Button lets the accessibility label be overridden', () => {
    const [button] = byRole(
      render(<Button label="Publier" onPress={() => {}} accessibilityLabel="Publier le trajet" />),
      'button',
    );
    expect(button!.props.accessibilityLabel).toBe('Publier le trajet');
  });

  it('Button marks disabled/loading state for assistive tech', () => {
    const [button] = byRole(render(<Button label="Envoyer" onPress={() => {}} loading />), 'button');
    expect(button!.props.accessibilityState).toEqual({ disabled: true, busy: true });
  });

  it("ScreenHeader's back control is a labeled button and the title is a header", () => {
    const root = render(<ScreenHeader onBack={() => {}} title="Mon véhicule" backLabel="Retour" />);
    const [back] = byRole(root, 'button');
    expect(back!.props.accessibilityLabel).toBe('Retour');
    expect(byRole(root, 'header')).toHaveLength(1);
  });

  it('Chip groups its icon and label into a single accessible node', () => {
    const node = render(<Chip label="Ponctuel" />).find(
      (n) => typeof n.type === 'string' && n.props.accessibilityLabel === 'Ponctuel',
    );
    expect(node.props.accessible).toBe(true);
  });

  it('Chip becomes a labeled, stateful button when given onPress', () => {
    const [chip] = byRole(render(<Chip label="Ponctuel" onPress={() => {}} selected />), 'button');
    expect(chip!.props.accessibilityLabel).toBe('Ponctuel');
    expect(chip!.props.accessibilityState).toEqual({ selected: true });
  });

  it('Badge exposes its label to assistive tech', () => {
    const [badge] = byRole(render(<Badge label="Vérifié" />), 'text');
    expect(badge!.props.accessible).toBe(true);
    expect(badge!.props.accessibilityLabel).toBe('Vérifié');
  });

  it('MessageBubble exposes sender/timestamp/body as one accessible node', () => {
    const [bubble] = byRole(render(<MessageBubble body="Bonjour" isOwn timestamp="10:00" />), 'text');
    expect(bubble!.props.accessible).toBe(true);
    expect(bubble!.props.accessibilityLabel).toBe('Vous, 10:00: Bonjour');
  });

  it('StarRatingInput exposes an adjustable role with the current value, and per-star buttons', () => {
    const root = render(<StarRatingInput value={3} onChange={() => {}} />);
    const [group] = byRole(root, 'adjustable');
    expect(group!.props.accessibilityValue).toEqual({ min: 1, max: 5, now: 3 });
    const stars = byRole(root, 'button');
    expect(stars).toHaveLength(5);
    expect(stars[2]!.props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(stars[3]!.props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(stars[0]!.props.accessibilityLabel).toBe('1 étoile');
    expect(stars[4]!.props.accessibilityLabel).toBe('5 étoiles');
  });

  it('Input passes its label and error to assistive tech', () => {
    const input = render(<Input label="Plaque" error="Format invalide" />).find(
      (n) => typeof n.type === 'string' && n.props.accessibilityLabel === 'Plaque',
    );
    expect(input.props.accessibilityHint).toBe('Format invalide');
  });

  it('StateView announces errors as alerts, never as plain text', () => {
    const [alert] = byRole(render(<StateView status="error" title="Impossible de charger" />), 'alert');
    expect(alert).toBeDefined();
  });
});
