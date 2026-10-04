import { useEffect } from 'react';
import { api, type MatchCandidate } from '../../state/api';

/** Most riders open one of the first few results; prefetching more than
 *  that would mostly download screens nobody opens. */
const PREFETCH_COUNT = 3;

/**
 * Warms the cache for the top search results — the ride, its driver's public
 * profile and its offered stops, exactly what search/ride-details.tsx loads
 * first — so tapping a result opens with content instead of a loading
 * state. Re-runs only when the top results themselves change, and skips any
 * entry already fetched recently (`ifOlderThan`).
 */
export function usePrefetchTopRides(candidates: MatchCandidate[]): void {
  const prefetchRide = api.usePrefetch('getRide');
  const prefetchProfile = api.usePrefetch('getUserPublicProfile');
  const prefetchStops = api.usePrefetch('getRideStops');

  const top = candidates.slice(0, PREFETCH_COUNT);
  const topKey = top.map((c) => `${c.rideId}:${c.driverUserId}`).join(',');

  useEffect(() => {
    for (const candidate of top) {
      prefetchRide(candidate.rideId, { ifOlderThan: 60 });
      prefetchProfile(candidate.driverUserId, { ifOlderThan: 300 });
      prefetchStops(candidate.rideId, { ifOlderThan: 300 });
    }
    // Keyed on the top results' identities, not the array (a new array on
    // every render would re-run this needlessly).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topKey, prefetchRide, prefetchProfile, prefetchStops]);
}
