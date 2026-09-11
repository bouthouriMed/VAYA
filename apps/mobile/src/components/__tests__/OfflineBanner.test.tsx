import { describe, it, expect, afterEach } from 'vitest';
import renderer, { act } from 'react-test-renderer';
import { OfflineBanner } from '../OfflineBanner';
import { __setMockIsConnected } from '../../__mocks__/netinfo';

// Manual act()+create() (not the one-shot renderJSON test-util) — this
// needs to read .toJSON() from the *same* renderer instance across
// multiple connectivity-change updates, not create a fresh tree each time.
describe('OfflineBanner', () => {
  afterEach(() => {
    __setMockIsConnected(true);
  });

  it('renders nothing while online', () => {
    let instance: renderer.ReactTestRenderer;
    act(() => {
      instance = renderer.create(<OfflineBanner />);
    });
    expect(instance!.toJSON()).toBeNull();
  });

  it('renders the offline message once connectivity drops', () => {
    let instance: renderer.ReactTestRenderer;
    act(() => {
      instance = renderer.create(<OfflineBanner />);
    });
    act(() => {
      __setMockIsConnected(false);
    });
    expect(instance!.toJSON()).not.toBeNull();
  });

  it('hides again once connectivity is restored', () => {
    let instance: renderer.ReactTestRenderer;
    act(() => {
      instance = renderer.create(<OfflineBanner />);
    });
    act(() => {
      __setMockIsConnected(false);
    });
    act(() => {
      __setMockIsConnected(true);
    });
    expect(instance!.toJSON()).toBeNull();
  });
});
