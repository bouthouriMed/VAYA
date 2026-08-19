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

describe('search/cluster.tsx routes through pickup-point.tsx for rides with stops', () => {
  const source = readScreen('search/cluster.tsx');

  it('branches on rankedStops before deciding where to navigate', () => {
    expect(source).toContain('candidate.rankedStops.length > 0');
    expect(source).toContain("pathname: '/search/pickup-point'");
  });

  it('clears any previously selected stop before a fresh ride selection', () => {
    expect(source).toContain('clearPickupStop');
  });
});

describe('search/trust.tsx prefers the selected stop over free-form coordinates', () => {
  const source = readScreen('search/trust.tsx');

  it('sends pickupStopId when a stop was selected', () => {
    expect(source).toContain('pickupStopId: selectedStop.stopId');
  });

  it('still falls back to free-form pickup for legacy (stop-less) rides', () => {
    expect(source).toMatch(/pickup:\s*{\s*label:\s*origin!\.label/);
  });
});
