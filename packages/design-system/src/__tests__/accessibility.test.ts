import { describe, it, expect } from 'vitest';
import { Button } from '../primitives/Button';
import { Chip } from '../primitives/Chip';
import { Badge } from '../primitives/Badge';
import { MessageBubble } from '../primitives/MessageBubble';

// Function components are plain functions — calling them directly returns
// the React element they'd render, without needing a renderer (none is
// configured in this 'node' test environment). Good enough to assert on
// the accessibility props actually reaching the underlying RN element,
// which is exactly what the Phase 2 accessibility baseline promises.
//
// This only works for components with no internal hooks (Button/Chip/Badge)
// — calling a hook-using component (e.g. Input, which has local focus
// state) outside a real render breaks React's hook dispatcher. Covering
// Input properly would need a renderer (react-test-renderer or similar),
// which isn't set up in this package; Input's accessibilityLabel/Hint
// wiring is verified by direct code review instead (Input.tsx).
describe('accessibility baseline', () => {
  it('Button exposes a button role and a label defaulting to its visible label', () => {
    const element = Button({ label: 'Publier', onPress: () => {} });
    expect(element.props.accessibilityRole).toBe('button');
    expect(element.props.accessibilityLabel).toBe('Publier');
  });

  it('Button lets the accessibility label be overridden', () => {
    const element = Button({
      label: 'Publier',
      onPress: () => {},
      accessibilityLabel: 'Publier le trajet',
    });
    expect(element.props.accessibilityLabel).toBe('Publier le trajet');
  });

  it('Button marks disabled/loading state for assistive tech', () => {
    const element = Button({ label: 'Envoyer', onPress: () => {}, loading: true });
    expect(element.props.accessibilityState).toEqual({ disabled: true, busy: true });
  });

  it('Chip groups its icon and label into a single accessible node', () => {
    const element = Chip({ label: 'Ponctuel' });
    expect(element.props.accessible).toBe(true);
    expect(element.props.accessibilityLabel).toBe('Ponctuel');
  });

  it('Badge exposes its label to assistive tech', () => {
    const element = Badge({ label: 'Vérifié' });
    expect(element.props.accessible).toBe(true);
    expect(element.props.accessibilityLabel).toBe('Vérifié');
  });

  it('MessageBubble exposes sender/timestamp/body as one accessible node', () => {
    const element = MessageBubble({ body: 'Bonjour', isOwn: true, timestamp: '10:00' });
    expect(element.props.accessible).toBe(true);
    expect(element.props.accessibilityRole).toBe('text');
    expect(element.props.accessibilityLabel).toBe('Vous, 10:00: Bonjour');
  });
});
