import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export type PositionStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'error';

export interface DevicePosition {
  lat: number;
  lng: number;
}

export interface UseCurrentPositionResult {
  status: PositionStatus;
  position: DevicePosition | null;
  /** Resolves the fix on demand — returns the already-resolved position
   *  instantly if one exists, otherwise awaits the in-flight/auto fetch
   *  instead of starting a redundant second one. Lets a "use my location"
   *  button stay tappable immediately instead of sitting disabled for
   *  however long the permission prompt + GPS fix take. */
  refresh: () => Promise<DevicePosition | null>;
}

/**
 * Wraps expo-location's foreground permission + single-shot fix. Real GPS
 * coordinates (not seed data) — reverse geocoding against known places
 * happens where the coordinates are consumed, since we don't have a
 * geocoding backend wired up yet.
 */
export function useCurrentPosition(autoFetch = true): UseCurrentPositionResult {
  const [status, setStatus] = useState<PositionStatus>('idle');
  const [position, setPosition] = useState<DevicePosition | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<DevicePosition | null> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback((): Promise<DevicePosition | null> => {
    if (inFlightRef.current) return inFlightRef.current;
    const attempt = (async (): Promise<DevicePosition | null> => {
      setStatus('loading');
      try {
        const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
        if (permStatus !== 'granted') {
          if (mountedRef.current) setStatus('denied');
          return null;
        }
        const loc = await Location.getCurrentPositionAsync({});
        const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        if (mountedRef.current) {
          setPosition(next);
          setStatus('granted');
        }
        return next;
      } catch {
        if (mountedRef.current) setStatus('error');
        return null;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = attempt;
    return attempt;
  }, []);

  useEffect(() => {
    if (autoFetch) void refresh();
  }, [autoFetch, refresh]);

  return { status, position, refresh };
}
