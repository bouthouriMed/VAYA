import { useCallback, useMemo } from 'react';
import { useGetMyDriverProfileQuery, useListMyRidesQuery } from '../../state/api';
import { useAppSelector } from '../../state/store';
import { resolveNotificationDeepLink, type NotificationDeepLinkType } from './deepLink';

/**
 * Where tapping a notification in the in-app inbox should go. A push
 * carries the recipient's role (driver/rider) from the server, but a stored
 * inbox row's payload doesn't — so when it's missing, the ride decides: a
 * notification about one of my own published rides is a driver's.
 */
export function useNotificationDestination(): (
  type: NotificationDeepLinkType,
  payload?: Record<string, unknown>,
) => string | null {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const { data: driverProfile } = useGetMyDriverProfileQuery(undefined, { skip: !accessToken });
  const { data: myRides } = useListMyRidesQuery(undefined, { skip: !driverProfile });
  const myRideIds = useMemo(() => new Set((myRides ?? []).map((r) => r.id)), [myRides]);

  return useCallback(
    (type, payload = {}) => {
      const rideId = typeof payload.rideId === 'string' ? payload.rideId : undefined;
      const role = payload.role ?? (rideId ? (myRideIds.has(rideId) ? 'driver' : 'rider') : undefined);
      return resolveNotificationDeepLink(type, { ...payload, role });
    },
    [myRideIds],
  );
}
