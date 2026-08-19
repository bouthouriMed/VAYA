import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type PositionStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'error';

export interface DevicePosition {
  lat: number;
  lng: number;
}

/**
 * Wraps expo-location's foreground permission + single-shot fix. Real GPS
 * coordinates (not seed data) — reverse geocoding against known places
 * happens where the coordinates are consumed, since we don't have a
 * geocoding backend wired up yet.
 */
export function useCurrentPosition(): { status: PositionStatus; position: DevicePosition | null } {
  const [status, setStatus] = useState<PositionStatus>('idle');
  const [position, setPosition] = useState<DevicePosition | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve(): Promise<void> {
      setStatus('loading');
      try {
        const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
        if (permStatus !== 'granted') {
          if (!cancelled) setStatus('denied');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        if (cancelled) return;
        setPosition({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        setStatus('granted');
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  return { status, position };
}
