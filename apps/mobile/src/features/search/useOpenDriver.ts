import { router } from 'expo-router';
import { useAppSelector } from '../../state/store';
import type { MatchCandidate } from '../../state/api';
import { trackEvent } from '../../services/analytics/analytics';

/**
 * Shared by every screen that lets a rider tap a specific matched ride
 * (search/results.tsx's list and inline map) — resolves straight to
 * ride-details.tsx, a pure browse/consult screen showing the pickup and
 * drop-off VAYA chose for this passenger (they never pick one themselves —
 * docs/roadmap/phase-14-intelligent-pickup-engine.md). search/trust.tsx is pure
 * driver-profile/trust content, reached only by tapping the driver row
 * *from* ride-details.
 */
export function useOpenDriver(): (candidate: MatchCandidate) => void {
  const searchId = useAppSelector((s) => s.search.searchId);

  return (candidate: MatchCandidate) => {
    trackEvent('search_result_selected', {
      searchId,
      selectedRideId: candidate.rideId,
      matchTier: candidate.matchType,
    });
    router.push({
      pathname: '/search/ride-details',
      params: { rideId: candidate.rideId, driverUserId: candidate.driverUserId },
    });
  };
}
