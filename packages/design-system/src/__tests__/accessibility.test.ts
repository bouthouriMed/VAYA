import { describe, it, expect } from 'vitest';
import { Button } from '../primitives/Button';
import { Chip } from '../primitives/Chip';
import { Badge } from '../primitives/Badge';
import { MessageBubble } from '../primitives/MessageBubble';
import { StarRatingInput } from '../primitives/StarRatingInput';
import { ScreenHeader } from '../primitives/ScreenHeader';

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

  it('Button still exposes press-feedback style as a function on the Pressable', () => {
    const element = Button({ label: 'Publier', onPress: () => {} });
    expect(typeof element.props.style).toBe('function');
  });

  it("ScreenHeader's back control has a button role and a 'Retour' label", () => {
    const element = ScreenHeader({ onBack: () => {}, title: 'Mon véhicule' });
    const backButton = (element.props.children as { props: Record<string, unknown> }[])[0]!;
    expect(backButton.props.accessibilityRole).toBe('button');
    expect(backButton.props.accessibilityLabel).toBe('Retour');
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

  it('Chip becomes a labeled, stateful button when given onPress (Phase 9)', () => {
    const element = Chip({ label: 'Ponctuel', onPress: () => {}, selected: true });
    expect(element.props.accessibilityRole).toBe('button');
    expect(element.props.accessibilityLabel).toBe('Ponctuel');
    expect(element.props.accessibilityState).toEqual({ selected: true });
  });

  it('StarRatingInput exposes an adjustable role with the current value, and per-star buttons', () => {
    const element = StarRatingInput({ value: 3, onChange: () => {} });
    expect(element.props.accessibilityRole).toBe('adjustable');
    expect(element.props.accessibilityValue).toEqual({ min: 1, max: 5, now: 3 });
    const stars = element.props.children as { props: Record<string, unknown> }[];
    expect(stars).toHaveLength(5);
    expect(stars[2]!.props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(stars[3]!.props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(stars[0]!.props.accessibilityLabel).toBe('1 étoile');
    expect(stars[4]!.props.accessibilityLabel).toBe('5 étoiles');
  });
});
