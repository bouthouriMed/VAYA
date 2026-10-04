import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderJSON } from './test-utils/renderJSON';
import type { RootState } from '../state/store';
import type { MatchCandidate, SearchResult } from '../state/api';
import type ResultsScreenComponent from '../../app/search/results';
import type { ToastProvider as ToastProviderComponent } from '@vaya/design-system';

/**
 * `ToastProvider` must come from the *same* `vi.resetModules()` graph as
 * `ResultsScreen` — a statically-imported `ToastProvider` binds to a
 * `ToastContext` object from the pre-reset module instance, which a
 * post-reset `useToast()` call (a different instance of the same source
 * file) won't match, throwing "must be used within a ToastProvider" even
 * though a provider is genuinely mounted above it.
 */
async function loadScreen(): Promise<{
  ResultsScreen: typeof ResultsScreenComponent;
  ToastProvider: typeof ToastProviderComponent;
}> {
  const [{ default: ResultsScreen }, { ToastProvider }] = await Promise.all([
    import('../../app/search/results'),
    import('@vaya/design-system'),
  ]);
  return { ResultsScreen, ToastProvider };
}

/**
 * Real react-test-renderer snapshots of search/results.tsx (Stitch
 * reference: "Ride Results - Cleaned Nav", project "Vaya Passenger Journey
 * UX") across its states — loading, exact match, the no-exact-match
 * wide_corridor fallback (the server-tiered cascade, Phase 13, docs/
 * roadmap/phase-13-search-engine.md — replaces the old two-endpoint
 * matching/corridor-fallback pair this suite used to mock separately), and
 * the genuine zero-results empty state.
 */

vi.mock('expo-router', () => ({
  router: { back: vi.fn(), push: vi.fn() },
}));

vi.mock('../features/search/useOpenDriver', () => ({
  useOpenDriver: () => vi.fn(),
}));

// Prefetching talks to the real RTK Query store; the screen's rendering
// doesn't depend on it.
vi.mock('../features/search/usePrefetchTopRides', () => ({
  usePrefetchTopRides: () => undefined,
}));

const searchState: RootState['search'] = {
  origin: { label: 'La Marsa, Tunis', lat: 36.88, lng: 10.32 },
  destination: { label: 'Avenue Habib Bourguiba, Tunis', lat: 36.8, lng: 10.18 },
  searchAt: '2026-08-21T21:00:00.000Z',
  desiredDepartureAt: null,
  selectedStop: null,
  selectedDropoffStop: null,
  overriddenPickup: null,
  passengers: 1,
  searchId: 'search-1',
};

function mockStore(search: RootState['search'] = searchState): void {
  vi.doMock('../state/store', () => ({
    useAppSelector: (selector: (s: Pick<RootState, 'search'>) => unknown) =>
      selector({ search }),
  }));
}

function candidate(overrides: Partial<MatchCandidate>): MatchCandidate {
  return {
    rideId: 'ride-1',
    driverUserId: 'user-1',
    driverFullName: 'Mehdi Gharbi',
    driverAvatarUrl: null,
    ratingAvg: 4.7,
    tripCount: 50,
    departureAt: '2026-08-21T21:28:00.000Z',
    seatsAvailable: 4,
    contributionPerSeat: 5.5,
    pickupWalkMeters: 0,
    pickupWalkMinutes: 0,
    dropoffWalkMeters: 0,
    dropoffWalkMinutes: 0,
    routeOverlapPercent: 0.8,
    score: 0.9,
    reasons: [],
    clusterLabel: 'Maintenant',
    originLat: 36.88,
    originLng: 10.32,
    destinationLat: 36.8,
    destinationLng: 10.18,
    passengerJourney: { originLat: 36.88, originLng: 10.32, destinationLat: 36.8, destinationLng: 10.18 },
    // A stop-less endpoint ride: boarding/alighting at the ride's own
    // endpoints, which coincide with the passenger's searched places here.
    pickupPoint: { stopId: null, label: 'La Marsa', lat: 36.88, lng: 10.32, walkMeters: 0, walkMinutes: 0 },
    dropoffPoint: { stopId: null, label: 'Avenue Habib Bourguiba', lat: 36.8, lng: 10.18, walkMeters: 0, walkMinutes: 0 },
    routePolyline: null,
    rankedStops: [],
    rankedDropoffStops: [],
    recommendedStopId: null,
    recommendedDropoffStopId: null,
    pickupViable: true,
    dropoffViable: true,
    matchType: 'endpoint',
    detour: null,
    pickupEtaSeconds: 0,
    dropoffEtaSeconds: 0,
    detourRoutePolyline: null,
    ...overrides,
  };
}

const candidates: MatchCandidate[] = [
  candidate({ rideId: 'ride-1', driverFullName: 'Mehdi Gharbi', ratingAvg: 4.7, score: 0.9, departureAt: '2026-08-21T21:28:00.000Z' }),
  candidate({ rideId: 'ride-2', driverUserId: 'user-2', driverFullName: 'Youssef Trabelsi', ratingAvg: 4.8, score: 0.6, departureAt: '2026-08-21T21:58:00.000Z' }),
];

function mockApi(state: { matching?: { data?: SearchResult; isLoading?: boolean } }): void {
  vi.doMock('../state/api', () => ({
    useMatchingSearchQuery: () => ({
      data: state.matching?.data,
      isLoading: state.matching?.isLoading ?? false,
    }),
    useNotifyMeMutation: () => [vi.fn(), { isLoading: false, isSuccess: false }],
    useListFellowPassengersQuery: () => ({ data: [] }),
  }));
}

describe('search/results.tsx snapshots', () => {
  it('renders the loading skeleton', async () => {
    vi.resetModules();
    mockStore();
    mockApi({ matching: { isLoading: true } });
    const { ResultsScreen, ToastProvider } = await loadScreen();
    const tree = renderJSON(
      <ToastProvider>
        <ResultsScreen />
      </ToastProvider>,
    );
    expect(tree).toMatchSnapshot();
  });

  it('renders exact matches with the top card flagged best-match', async () => {
    vi.resetModules();
    mockStore();
    mockApi({
      matching: { data: { tier: 'exact', candidates, standoutRideId: 'ride-1', message: null } },
    });
    const { ResultsScreen, ToastProvider } = await loadScreen();
    const tree = renderJSON(
      <ToastProvider>
        <ResultsScreen />
      </ToastProvider>,
    );
    expect(tree).toMatchSnapshot();
  });

  it('renders the wide_corridor fallback: server banner + best-match tag on the top card', async () => {
    vi.resetModules();
    mockStore();
    mockApi({
      matching: {
        data: {
          tier: 'wide_corridor',
          candidates,
          standoutRideId: 'ride-1',
          message:
            "Aucun trajet exactement à l'heure demandée près de vous. Voici les correspondances les plus proches.",
        },
      },
    });
    const { ResultsScreen, ToastProvider } = await loadScreen();
    const tree = renderJSON(
      <ToastProvider>
        <ResultsScreen />
      </ToastProvider>,
    );
    expect(tree).toMatchSnapshot();
  });

  it('renders the genuine empty state with a notify-me action', async () => {
    vi.resetModules();
    mockStore();
    mockApi({
      matching: { data: { tier: 'none', candidates: [], standoutRideId: null, message: null } },
    });
    const { ResultsScreen, ToastProvider } = await loadScreen();
    const tree = renderJSON(
      <ToastProvider>
        <ResultsScreen />
      </ToastProvider>,
    );
    expect(tree).toMatchSnapshot();
  });

  // The reported bug: driver Cité Tahrir -> La Marsa, passenger Menzah 6 ->
  // Lac 2. The card must show the passenger's own journey with the resolved
  // Menzah 6 pickup / Lac 2 drop-off stops — never La Marsa.
  it("shows the passenger's own Menzah 6 -> Lac 2 journey for a sub-segment of a Cité Tahrir -> La Marsa ride", async () => {
    vi.resetModules();
    mockStore({
      ...searchState,
      origin: { label: 'Menzah 6, Ariana', lat: 36.8495, lng: 10.1735 },
      destination: { label: 'Lac 2, Tunis', lat: 36.853, lng: 10.2735 },
    });
    const menzahStop = { stopId: 'stop-menzah', label: 'Av. Hédi Nouira', lat: 36.8475, lng: 10.1725, walkMeters: 240, walkMinutes: 3, sequence: 1 };
    const lacStop = { stopId: 'stop-lac', label: 'Rue du Lac Windermere', lat: 36.8505, lng: 10.2712, walkMeters: 320, walkMinutes: 4, sequence: 2 };
    mockApi({
      matching: {
        data: {
          tier: 'route_passthrough',
          standoutRideId: null,
          message: null,
          candidates: [
            candidate({
              matchType: 'route_passthrough',
              // The driver's own ride: Cité Tahrir -> La Marsa.
              originLat: 36.826,
              originLng: 10.14,
              destinationLat: 36.878,
              destinationLng: 10.324,
              passengerJourney: { originLat: 36.8495, originLng: 10.1735, destinationLat: 36.853, destinationLng: 10.2735 },
              pickupPoint: { stopId: menzahStop.stopId, label: menzahStop.label, lat: menzahStop.lat, lng: menzahStop.lng, walkMeters: 240, walkMinutes: 3 },
              dropoffPoint: { stopId: lacStop.stopId, label: lacStop.label, lat: lacStop.lat, lng: lacStop.lng, walkMeters: 320, walkMinutes: 4 },
              rankedStops: [menzahStop],
              rankedDropoffStops: [lacStop],
              recommendedStopId: menzahStop.stopId,
              recommendedDropoffStopId: lacStop.stopId,
              pickupWalkMeters: 240,
              pickupWalkMinutes: 3,
              dropoffWalkMeters: 320,
              dropoffWalkMinutes: 4,
              pickupEtaSeconds: 600,
              dropoffEtaSeconds: 1500,
            }),
          ],
        },
      },
    });
    const { ResultsScreen, ToastProvider } = await loadScreen();
    const rendered = JSON.stringify(
      renderJSON(
        <ToastProvider>
          <ResultsScreen />
        </ToastProvider>,
      ),
    );
    expect(rendered).toContain('Menzah 6');
    expect(rendered).toContain('Lac 2');
    expect(rendered).toContain('Av. Hédi Nouira');
    expect(rendered).toContain('Rue du Lac Windermere');
    expect(rendered).not.toContain('La Marsa');
    expect(rendered).not.toContain('Tahrir');
  });
});
