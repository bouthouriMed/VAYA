import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderJSON } from './test-utils/renderJSON';
import type { RootState } from '../state/store';

/**
 * Real react-test-renderer snapshots of search/composer.tsx (Stitch
 * reference: "Origin/Destination Selection",
 * stitch/search_flow/search-refined-{origin,destination}-autocomplete.html)
 * — one field fully focused at a time, title/search-pill/saved-places/
 * recents all swapping with `activeField` (seeded from the `field` route
 * param, mirroring explore.tsx's two real entry points).
 */

vi.mock('expo-router', () => ({
  router: { back: vi.fn(), push: vi.fn() },
}));

vi.mock('../services/location/useCurrentPosition', () => ({
  useCurrentPosition: () => ({
    status: 'granted',
    position: { lat: 36.8, lng: 10.18 },
    refresh: () => Promise.resolve({ lat: 36.8, lng: 10.18 }),
  }),
}));

// renderJSON's synchronous act() captures the tree before this promise's
// microtask resolves, so whatever it resolves to never reaches the
// snapshot — only that it resolves (never throws) matters here.
vi.mock('../services/search/recentPlacesStorage', () => ({
  loadRecentPlaces: () => Promise.resolve([]),
  addRecentPlace: vi.fn(() => Promise.resolve([])),
}));

function mockRouteParams(field?: 'origin' | 'destination'): void {
  vi.doMock('expo-router', () => ({
    router: { back: vi.fn(), push: vi.fn() },
    useLocalSearchParams: () => ({ field }),
  }));
}

function mockStore(search: Partial<RootState['search']>): void {
  vi.doMock('../state/store', () => ({
    useAppDispatch: () => vi.fn(),
    useAppSelector: (selector: (s: Pick<RootState, 'search'>) => unknown) =>
      selector({ search: { origin: null, destination: null, ...search } } as Pick<RootState, 'search'>),
  }));
}

function mockApi(): void {
  vi.doMock('../state/api', () => ({
    useLazyGeocodeAutocompleteQuery: () => [vi.fn(), { data: undefined, isFetching: false }],
    useLazyGeocodePlaceDetailsQuery: () => [vi.fn(), { isFetching: false }],
    useLazyGeocodeReverseQuery: () => [
      vi.fn(() => ({ unwrap: () => Promise.resolve({ label: 'Ma position actuelle', lat: 36.8, lng: 10.18 }) })),
      { isFetching: false },
    ],
  }));
}

describe('search/composer.tsx snapshots', () => {
  it('renders the origin field active — title, current-position row, saved places, recents', async () => {
    vi.resetModules();
    mockRouteParams('origin');
    mockStore({});
    mockApi();
    const { default: SearchComposerScreen } = await import('../../app/search/composer');
    const tree = renderJSON(<SearchComposerScreen />);
    expect(tree).toMatchSnapshot();
  });

  it('renders the destination field active — no current-position row', async () => {
    vi.resetModules();
    mockRouteParams('destination');
    mockStore({ origin: { label: 'La Marsa, Tunis', lat: 36.88, lng: 10.32 } });
    mockApi();
    const { default: SearchComposerScreen } = await import('../../app/search/composer');
    const tree = renderJSON(<SearchComposerScreen />);
    expect(tree).toMatchSnapshot();
  });
});
