import { describe, it, expect, vi } from 'vitest';
import renderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { RequestSeatSheet } from '../RequestSeatSheet';

function render(onSubmit: (m: string | undefined) => void): ReactTestInstance {
  let instance: renderer.ReactTestRenderer;
  act(() => {
    instance = renderer.create(
      <RequestSeatSheet
        visible
        driverName="Mehdi Jaziri"
        driverAvatarUrl={null}
        legLabel="Ariana → Sousse · Demain 08:00"
        priceLabel="9 DT"
        onClose={() => undefined}
        onSubmit={onSubmit}
      />,
    );
  });
  return instance!.root;
}

const byLabel = (root: ReactTestInstance, label: string) =>
  root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === label)[0]!;
const press = (node: ReactTestInstance) => act(() => node.props.onPress());

describe('RequestSeatSheet', () => {
  it('sends without a message when the field is left empty', () => {
    const onSubmit = vi.fn();
    const root = render(onSubmit);
    press(byLabel(root, 'requestSheet.send'));
    expect(onSubmit).toHaveBeenCalledWith(undefined);
  });

  it('turns a suggestion chip into the message that is sent', () => {
    const onSubmit = vi.fn();
    const root = render(onSubmit);
    press(byLabel(root, 'requestSheet.suggestion.luggage.chip'));
    press(byLabel(root, 'requestSheet.send'));
    expect(onSubmit).toHaveBeenCalledWith('requestSheet.suggestion.luggage.text');
  });
});
