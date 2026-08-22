import { router } from 'expo-router';
import { useAppDispatch } from '../../state/store';
import { clearSelectedStops } from '../../state/searchSlice';
import type { MatchCandidate } from '../../state/api';

/**
 * Shared by every screen that lets a rider tap a specific matched ride
 * (search/results.tsx's list and inline map) — all must resolve to the same
 * chain: pick a pickup stop when the ride has any (docs/domain/
 * ride-engine.md), then a dropoff stop when the ride *also* has ranked
 * dropoff stops (Phase 13, docs/roadmap/phase-13-search-engine.md — only
 * ever true for a route-passthrough match, since an endpoint match's
 * dropoff is just the ride's own destination), then ride-details.tsx —
 * search/trust.tsx is pure driver-profile/trust content, reached only by
 * tapping the driver row *from* ride-details.
 */
export function useOpenDriver(): (candidate: MatchCandidate) => void {
  const dispatch = useAppDispatch();

  return (candidate: MatchCandidate) => {
    // A fresh ride selection always starts with a clean pickup/dropoff-stop
    // slate — otherwise a stop chosen for a previous ride could leak into
    // this one.
    dispatch(clearSelectedStops());
    const params = { rideId: candidate.rideId, driverUserId: candidate.driverUserId };
    if (candidate.rankedStops.length > 0) {
      router.push({ pathname: '/search/pickup-point', params });
    } else if (candidate.rankedDropoffStops.length > 0) {
      router.push({ pathname: '/search/dropoff-point', params });
    } else {
      router.push({ pathname: '/search/ride-details', params });
    }
  };
}
