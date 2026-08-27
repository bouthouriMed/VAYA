import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useUpdateTripLocationMutation, useReportTrackingIssueMutation } from '../../state/api';

export type LocationBroadcastStatus = 'idle' | 'watching' | 'permission_denied' | 'error';

function normalize(value: number | null | undefined): number | null {
  // expo-location reports -1 for heading/speed when the device can't
  // determine them — never forward a sentinel negative as if it were real.
  return typeof value === 'number' && value >= 0 ? value : null;
}

/**
 * Foreground-only GPS broadcast for the driver ride-hub screen
 * (docs/domain/live-tracking.md's throttling policy: ~6-10s cadence,
 * client-side, not server-enforced beyond a defensive rate-limit ceiling).
 * A driver has exactly one physical position but a ride can have several
 * independent `trips` rows (one per accepted booking) — every fix is
 * broadcast to every currently-trackable trip on this ride, not just one.
 *
 * Deliberately foreground-only: true background tracking needs additional
 * native permission entitlements (`ACCESS_BACKGROUND_LOCATION` / iOS
 * "Always" location) and real battery-review implications neither this
 * change nor this sandboxed environment can verify — a stated limitation,
 * not a silently missing feature (see the top-level progress doc).
 */
export function useDriverLocationBroadcast(trackableTripIds: string[]): {
  status: LocationBroadcastStatus;
  retryPermission: () => void;
} {
  const [status, setStatus] = useState<LocationBroadcastStatus>('idle');
  const [updateTripLocation] = useUpdateTripLocationMutation();
  const [reportTrackingIssue] = useReportTrackingIssueMutation();
  const watchSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const issueReportedRef = useRef(false);
  const tripIdsRef = useRef<string[]>(trackableTripIds);
  tripIdsRef.current = trackableTripIds;
  const [retryToken, setRetryToken] = useState(0);

  const hasTrackableTrips = trackableTripIds.length > 0;

  useEffect(() => {
    if (!hasTrackableTrips) {
      watchSubscriptionRef.current?.remove();
      watchSubscriptionRef.current = null;
      issueReportedRef.current = false;
      setStatus('idle');
      return;
    }

    let cancelled = false;

    async function start(): Promise<void> {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (permStatus !== 'granted') {
        setStatus('permission_denied');
        if (!issueReportedRef.current) {
          issueReportedRef.current = true;
          tripIdsRef.current.forEach((id) => void reportTrackingIssue(id));
        }
        return;
      }
      issueReportedRef.current = false;
      try {
        const subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 7000, distanceInterval: 15 },
          (loc) => {
            tripIdsRef.current.forEach((tripId) => {
              void updateTripLocation({
                tripId,
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                headingDeg: normalize(loc.coords.heading),
                speedMps: normalize(loc.coords.speed),
                accuracyM: loc.coords.accuracy ?? null,
              });
            });
          },
        );
        if (cancelled) {
          subscription.remove();
          return;
        }
        watchSubscriptionRef.current = subscription;
        setStatus('watching');
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    void start();

    return () => {
      cancelled = true;
      watchSubscriptionRef.current?.remove();
      watchSubscriptionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTrackableTrips, retryToken]);

  return { status, retryPermission: () => setRetryToken((n) => n + 1) };
}
