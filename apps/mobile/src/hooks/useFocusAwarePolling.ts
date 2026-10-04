import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

/**
 * Whether this screen is the one currently shown. Tab screens and screens
 * underneath a pushed screen stay mounted, so anything they poll kept
 * polling while invisible. Outside any navigator (component tests) the
 * screen counts as focused.
 */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const unsubscribeFocus = navigation.addListener('focus', () => setFocused(true));
    const unsubscribeBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  return focused;
}

/** Polling options for an RTK Query hook that should only poll while its
 *  data is actually on screen. */
export interface FocusAwarePolling {
  pollingInterval: number;
  skipPollingIfUnfocused: true;
}

/**
 * Polls every `intervalMs` only while this screen is focused AND the app is
 * in the foreground (`skipPollingIfUnfocused`, driven by the AppState
 * listener in state/store.ts). Coming back to the screen refetches right
 * away anyway (refetchOnMountOrArgChange / refetchOnFocus in state/api.ts),
 * so pausing costs no freshness — only the invisible requests disappear.
 *
 * `whileBlurred: true` keeps polling when the screen is hidden behind
 * another one, for data that stays visible everywhere (the tab bar's unread
 * badge); it still pauses in the background.
 */
export function useFocusAwarePolling(
  intervalMs: number,
  options: { whileBlurred?: boolean } = {},
): FocusAwarePolling {
  const focused = useScreenFocused();
  return {
    pollingInterval: focused || options.whileBlurred ? intervalMs : 0,
    skipPollingIfUnfocused: true,
  };
}
