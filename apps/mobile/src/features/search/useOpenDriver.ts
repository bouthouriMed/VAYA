import { router } from 'expo-router';
import { useAppDispatch } from '../../state/store';
import { clearSelectedStops } from '../../state/searchSlice';
import type { MatchCandidate } from '../../state/api';

/**
 * Shared by every screen that lets a rider tap a specific matched ride
 * (search/results.tsx's list and inline map) — resolves straight to
 * ride-details.tsx, a pure browse/consult screen. Pickup/dropoff-stop
 * confirmation (docs/domain/ride-engine.md, Phase 13 dropoff stops) no
 * longer gates *viewing* a ride — it's triggered from ride-details.tsx's
 * own "Request a seat" CTA instead, so a rider can freely look at several
 * candidate rides before committing to one. search/trust.tsx is pure
 * driver-profile/trust content, reached only by tapping the driver row
 * *from* ride-details.
 */
export function useOpenDriver(): (candidate: MatchCandidate) => void {
  const dispatch = useAppDispatch();

  return (candidate: MatchCandidate) => {
    // A fresh ride selection always starts with a clean pickup/dropoff-stop
    // slate — otherwise a stop chosen for a previous ride could leak into
    // this one.
    dispatch(clearSelectedStops());
    router.push({
      pathname: '/search/ride-details',
      params: { rideId: candidate.rideId, driverUserId: candidate.driverUserId },
    });
  };
}
