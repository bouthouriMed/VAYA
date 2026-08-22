import { router } from 'expo-router';
import { useAppDispatch } from '../../state/store';
import { clearPickupStop } from '../../state/searchSlice';
import type { MatchCandidate } from '../../state/api';

/**
 * Shared by every screen that lets a rider tap a specific matched ride
 * (search/results.tsx's list and inline map) — both must resolve to the
 * same next screen: a ride with real driver-selected `route_stops` requires
 * picking one (docs/domain/ride-engine.md), a legacy stop-less ride goes
 * straight to the ride-details flow (search/ride-details.tsx), which is
 * where the actual booking request now happens — search/trust.tsx is pure
 * driver-profile/trust content, reached only by tapping the driver row
 * *from* ride-details.
 */
export function useOpenDriver(): (candidate: MatchCandidate) => void {
  const dispatch = useAppDispatch();

  return (candidate: MatchCandidate) => {
    // A fresh ride selection always starts with a clean pickup-stop slate
    // — otherwise a stop chosen for a previous ride could leak into this one.
    dispatch(clearPickupStop());
    const params = { rideId: candidate.rideId, driverUserId: candidate.driverUserId };
    if (candidate.rankedStops.length > 0) {
      router.push({ pathname: '/search/pickup-point', params });
    } else {
      router.push({ pathname: '/search/ride-details', params });
    }
  };
}
