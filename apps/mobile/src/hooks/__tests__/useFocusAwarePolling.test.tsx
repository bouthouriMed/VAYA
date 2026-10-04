import React from 'react';
import { describe, it, expect } from 'vitest';
import { act, create } from 'react-test-renderer';
import { NavigationContext } from '@react-navigation/native';
import { useFocusAwarePolling, type FocusAwarePolling } from '../useFocusAwarePolling';

type Listener = () => void;

function fakeNavigation(initiallyFocused: boolean) {
  const listeners: Record<string, Listener[]> = { focus: [], blur: [] };
  let focused = initiallyFocused;
  return {
    isFocused: () => focused,
    addListener: (event: 'focus' | 'blur', listener: Listener) => {
      listeners[event]!.push(listener);
      return () => {
        listeners[event] = listeners[event]!.filter((l) => l !== listener);
      };
    },
    emit(event: 'focus' | 'blur') {
      focused = event === 'focus';
      for (const listener of listeners[event]!) listener();
    },
  };
}

function render(navigation: ReturnType<typeof fakeNavigation> | undefined, interval = 30_000) {
  const result: { current?: FocusAwarePolling } = {};
  function Probe(): null {
    result.current = useFocusAwarePolling(interval);
    return null;
  }
  const Provider = NavigationContext.Provider as unknown as React.ComponentType<{
    value: unknown;
    children: React.ReactNode;
  }>;
  act(() => {
    create(
      <Provider value={navigation}>
        <Probe />
      </Provider>,
    );
  });
  return result;
}

describe('useFocusAwarePolling', () => {
  it('polls while the screen is focused, and always pauses in the background', () => {
    const result = render(fakeNavigation(true));
    expect(result.current).toEqual({ pollingInterval: 30_000, skipPollingIfUnfocused: true });
  });

  it('stops polling a hidden tab / covered screen, and resumes when it comes back', () => {
    const navigation = fakeNavigation(true);
    const result = render(navigation);
    act(() => navigation.emit('blur'));
    expect(result.current?.pollingInterval).toBe(0);
    act(() => navigation.emit('focus'));
    expect(result.current?.pollingInterval).toBe(30_000);
  });

  it('starts paused for a screen mounted in the background', () => {
    expect(render(fakeNavigation(false)).current?.pollingInterval).toBe(0);
  });

  it('outside any navigator counts as focused', () => {
    expect(render(undefined).current?.pollingInterval).toBe(30_000);
  });
});
