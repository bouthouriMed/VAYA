import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useUpdateTripLocationMutation, useReportTrackingIssueMutation } from '../../state/api';

export type LocationBroadcastStatus = 'idle' | 'watching' | 'permission_denied' | 'error';

function normalize(value: number | null | undefined): number | null {
  // expo-location reports -1 for heading/speed when the device can't
  // determine them — never forward a sentinel negative as if it were real.
  return typeof value === 'number' && value >= 0 ? value : null;
}

// The actual outbound cadence guard, independent of native delivery rate.
// With distanceInterval: 0 (see the watchPositionAsync call below), iOS can
// hand back a new fix roughly as fast as the GPS chip itself updates
// (~1/s) — this keeps what we actually POST at the intended ~7-10s cadence
// regardless of platform, so a driver with several accepted passengers
// can't multiply that into a burst that trips POST /trips/:id/location's
// server-side rate-limit ceiling (20 req/10s, shared per IP across every
// trip: id that route matches).
const MIN_SEND_INTERVAL_MS = 7000;

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
  const lastSentAtRef = useRef(0);

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
          // `timeInterval` is Android-only (expo-location docs: "Available
          // only for Android") — on iOS, `distanceInterval` (CLLocationManager's
          // `distanceFilter`) is the *only* thing that gates delivery, with
          // no time-based fallback at all. The previous 15m threshold meant
          // an iOS driver stopped at a light, in traffic, or waiting at the
          // pickup point for more than ~90s produced *zero* updates —
          // tracking correctly (if confusingly) showed "unavailable" even
          // though the app was fully active the whole time. 0 removes the
          // distance gate so delivery is effectively continuous (throttled
          // naturally by the GPS hardware's own ~1Hz rate) on both
          // platforms; `timeInterval` still governs Android's cadence.
          { accuracy: Location.Accuracy.High, timeInterval: 7000, distanceInterval: 0 },
          (loc) => {
            const now = Date.now();
            if (now - lastSentAtRef.current < MIN_SEND_INTERVAL_MS) return;
            lastSentAtRef.current = now;
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
