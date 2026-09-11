import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Previously this app had no connectivity awareness at all — RTK Query's
 * own error states are the only signal a request ever gets, so a device
 * that's fully offline still shows "loading" until each individual request
 * times out (see api.ts's new 15s `timeout`) rather than an immediate,
 * honest "you're offline" surface. `isConnected` (radio-level) is the
 * signal used, not `isInternetReachable` (NetInfo's own reachability probe,
 * which is slower and can false-negative behind a captive portal or
 * restrictive firewall) — matches this being a coarse banner, not a
 * per-request gate.
 */
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false);
    });
    return unsubscribe;
  }, []);

  return isOffline;
}
