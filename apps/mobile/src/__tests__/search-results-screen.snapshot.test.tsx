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

const searchState: RootState['search'] = {
  origin: { label: 'La Marsa, Tunis', lat: 36.88, lng: 10.32 },
  destination: { label: 'Avenue Habib Bourguiba, Tunis', lat: 36.8, lng: 10.18 },
  searchAt: '2026-08-21T21:00:00.000Z',
  desiredDepartureAt: null,
  selectedStop: null,
  selectedDropoffStop: null,
  passengers: 1,
};

function mockStore(): void {
  vi.doMock('../state/store', () => ({
    useAppSelector: (selector: (s: Pick<RootState, 'search'>) => unknown) =>
      selector({ search: searchState }),
  }));
}

function candidate(overrides: Partial<MatchCandidate>): MatchCandidate {
  return {
    rideId: 'ride-1',
    driverUserId: 'user-1',
    driverFullName: 'Mehdi Gharbi',
    ratingAvg: 4.7,
    tripCount: 50,
    departureAt: '2026-08-21T21:28:00.000Z',
    seatsAvailable: 4,
    contributionPerSeat: 5.5,
    pickupWalkMinutes: 0,
    dropoffWalkMinutes: 0,
    routeOverlapPercent: 0.8,
    score: 0.9,
    reasons: [],
    clusterLabel: 'Maintenant',
    originLat: 36.88,
    originLng: 10.32,
    destinationLat: 36.8,
    destinationLng: 10.18,
    routePolyline: null,
    rankedStops: [],
    rankedDropoffStops: [],
    pickupViable: true,
    dropoffViable: true,
    matchType: 'endpoint',
    detour: null,
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
    mockApi({ matching: { data: { tier: 'exact', candidates, message: null } } });
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
    mockApi({ matching: { data: { tier: 'none', candidates: [], message: null } } });
    const { ResultsScreen, ToastProvider } = await loadScreen();
    const tree = renderJSON(
      <ToastProvider>
        <ResultsScreen />
      </ToastProvider>,
    );
    expect(tree).toMatchSnapshot();
  });
});
