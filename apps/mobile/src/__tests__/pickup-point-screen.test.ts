import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(dirname, '../../app');

function readScreen(relativePath: string): string {
  return readFileSync(path.join(appDir, relativePath), 'utf-8');
}

// No React Native component-rendering harness exists in this repo (see
// booking-screens-real-data.test.ts's note — same constraint applies
// here). This is a source-level regression guard for the single worst
// finding in docs/product/audit.md §4: search/pickup-point.tsx's pixel
// projection (`PX_PER_DEGREE`) that had no real geocoordinates behind it
// at all. Ranking/selection logic itself is covered with real unit tests
// in src/features/pickup-selection/__tests__/pickupSelection.test.ts.
describe('search/pickup-point.tsx is real-map-backed, not pixel-projection', () => {
  const source = readScreen('search/pickup-point.tsx');

  it('contains no trace of the old pixel-projection mechanism', () => {
    expect(source).not.toMatch(/PX_PER_DEGREE/);
    expect(source).not.toMatch(/SNAP_THRESHOLD_PX/);
    expect(source).not.toMatch(/GRID_STEP/);
    expect(source).not.toMatch(/GRID_EXTENT/);
    expect(source).not.toMatch(/PanResponder/);
    expect(source).not.toMatch(/from ['"].*mocks\/seed-data['"]/);
  });

  it('renders a real map primitive instead of a hand-rolled canvas', () => {
    expect(source).toContain('MapCanvas');
  });

  it('sources its markers/list from the matching API\'s rankedStops, not local mock data', () => {
    expect(source).toContain('rankedStops');
    expect(source).toContain('useMatchingSearchQuery');
  });

  it('selecting a stop dispatches a real stopId into search state', () => {
    expect(source).toContain('selectPickupStop');
    expect(source).toContain('stopId: selectedStop.stopId');
  });

  it('shows an honest EmptyState when zero stops are within range', () => {
    expect(source).toContain('EmptyState');
    expect(source).toContain('rankedStops.length === 0');
  });

  it('fires the pickup_stop_selected and pickup_no_viable_stop analytics events', () => {
    expect(source).toContain("trackEvent('pickup_stop_selected'");
    expect(source).toContain("trackEvent('pickup_no_viable_stop'");
  });
});

describe('search/results.tsx routes through pickup-point.tsx for rides with stops', () => {
  // useOpenDriver() (apps/mobile/src/features/search/useOpenDriver.ts) is
  // the single source of this branching behavior — results.tsx's list and
  // inline map both call it. search/cluster.tsx (the old multi-candidate
  // map) was dropped; search/ride-details.tsx is the new post-selection
  // screen, reached either directly or after a pickup-point.tsx selection.
  const hookSource = readFileSync(
    path.resolve(appDir, '../src/features/search/useOpenDriver.ts'),
    'utf-8',
  );
  const resultsSource = readScreen('search/results.tsx');

  it('branches on rankedStops before deciding where to navigate', () => {
    expect(hookSource).toContain('candidate.rankedStops.length > 0');
    expect(hookSource).toContain("pathname: '/search/pickup-point'");
  });

  it('resolves a stop-less ride straight to ride-details, not trust', () => {
    expect(hookSource).toContain("pathname: '/search/ride-details'");
  });

  it('clears any previously selected pickup/dropoff stop before a fresh ride selection', () => {
    expect(hookSource).toContain('clearSelectedStops');
  });

  it('routes to dropoff-point.tsx for a route-passthrough match with ranked dropoff stops', () => {
    expect(hookSource).toContain('candidate.rankedDropoffStops.length > 0');
    expect(hookSource).toContain("pathname: '/search/dropoff-point'");
  });

  it('results.tsx uses the shared hook', () => {
    expect(resultsSource).toContain('useOpenDriver');
  });

  it('pickup-point.tsx hands off to ride-details.tsx after a stop is chosen', () => {
    const pickupPointSource = readScreen('search/pickup-point.tsx');
    expect(pickupPointSource).toContain("pathname: '/search/ride-details'");
  });
});

describe('search/ride-details.tsx prefers the selected stop over free-form coordinates', () => {
  const source = readScreen('search/ride-details.tsx');

  it('sends pickupStopId when a stop was selected', () => {
    expect(source).toContain('pickupStopId: selectedStop.stopId');
  });

  it('still falls back to free-form pickup for legacy (stop-less) rides', () => {
    expect(source).toMatch(/pickup:\s*{\s*label:\s*origin!\.label/);
  });

  it('sends dropoffStopId when a dropoff stop was selected (Phase 13)', () => {
    expect(source).toContain('dropoffStopId: selectedDropoffStop.stopId');
  });
});

// Phase 13 (docs/roadmap/phase-13-search-engine.md): dropoff-point.tsx is
// the dropoff-side mirror of pickup-point.tsx — same source-level
// regression discipline (no RN render harness in this repo).
describe('search/dropoff-point.tsx is real-map-backed and stop-driven', () => {
  const source = readScreen('search/dropoff-point.tsx');

  it('sources its markers/list from the matching API\'s rankedDropoffStops', () => {
    expect(source).toContain('rankedDropoffStops');
    expect(source).toContain('useMatchingSearchQuery');
  });

  it('selecting a stop dispatches a real stopId into search state', () => {
    expect(source).toContain('selectDropoffStop');
    expect(source).toContain('stopId: selectedStop.stopId');
  });

  it('shows an honest EmptyState when zero dropoff stops are within range', () => {
    expect(source).toContain('EmptyState');
    expect(source).toContain('rankedDropoffStops.length === 0');
  });

  it('hands off to ride-details.tsx after a dropoff stop is chosen', () => {
    expect(source).toContain("pathname: '/search/ride-details'");
  });
});

describe('search/trust.tsx is a pure profile view, not a second booking path', () => {
  const source = readScreen('search/trust.tsx');

  it('has no booking mutation of its own — that moved to ride-details.tsx', () => {
    expect(source).not.toContain('useCreateBookingMutation');
  });
});
